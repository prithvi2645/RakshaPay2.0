import 'dart:async';

import '../models/risk_result.dart';
import 'fraud_signals.dart';
import 'qr_risk_analyzer.dart';
import 'scam_database_service.dart';
import 'scam_text_matcher.dart';
import 'sender_reputation.dart';

/// Coordinates the two on-device models and the community scam database.
///
/// Everything here runs locally. The database check is against the locally
/// cached copy, so scoring works with no connectivity.
class RiskEngine {
  final QrRiskAnalyzer qrAnalyzer;
  final ScamTextMatcher textMatcher;
  final ScamDatabaseService scamDatabase;

  RiskEngine({
    QrRiskAnalyzer? qrAnalyzer,
    ScamTextMatcher? textMatcher,
    ScamDatabaseService? scamDatabase,
  })  : qrAnalyzer = qrAnalyzer ?? QrRiskAnalyzer(),
        textMatcher = textMatcher ?? ScamTextMatcher(),
        scamDatabase = scamDatabase ?? ScamDatabaseService();

  bool _initialized = false;
  bool get isInitialized => _initialized;

  Future<void> init() async {
    if (_initialized) return;
    await Future.wait([qrAnalyzer.load(), textMatcher.load()]);
    await scamDatabase.loadCache();
    _initialized = true;
    unawaited(scamDatabase.sync());
  }

  RiskResult analyzeQr(String payload) {
    final features = qrAnalyzer.extractFeatures(payload);
    final result = qrAnalyzer.analyze(payload);
    return _applyCommunityOverride(result, features.vpa);
  }

  /// Scores an SMS body.
  ///
  /// The text model alone over-flags Indian transactional SMS: it was trained
  /// on a general spam corpus where "spam" means marketing, and bank alerts,
  /// OTPs and recharge offers all carry marketing-shaped language. Two
  /// signals correct that before anything reaches the user:
  ///
  ///  * who sent it — a DLT-registered header is very hard to forge
  ///  * whether it actually asks for anything a scam needs (PIN, OTP, KYC
  ///    panic, remote access, "pay to receive")
  ///
  /// A message with no such ask is never raised above Caution, regardless of
  /// what the model scores.
  RiskResult analyzeText(String text, {String? sender, String? vpa}) {
    final base = textMatcher.analyze(text);

    final trust = SenderReputation.classify(sender);
    final signals = FraudSignals.detect(text);

    var score = base.score * SenderReputation.riskMultiplier(trust);

    if (signals.isNotEmpty) {
      score = score < 60 ? 60 : score;
      score += (signals.length - 1) * 12;
    } else {
      score = score.clamp(0, 55);
    }

    final reasons = <String>[
      ...signals.map((s) => s.explanation),
      if (signals.isEmpty && score >= 35)
        'Wording resembles promotional or scam messages, but it does not ask you for anything',
      if (signals.isEmpty && score < 35) 'No scam patterns detected',
      if (trust == SenderTrust.registeredBusiness) SenderReputation.describe(trust),
      if (trust == SenderTrust.personalNumber && signals.isNotEmpty) SenderReputation.describe(trust),
    ];

    final result = RiskResult.fromScore(score.round().clamp(0, 100), reasons);
    return vpa == null ? result : _applyCommunityOverride(result, vpa);
  }

  /// A VPA the community has confirmed as a scam outranks whatever the model
  /// says — reported-by-real-people is stronger evidence than structure alone.
  RiskResult _applyCommunityOverride(RiskResult result, String vpa) {
    if (!scamDatabase.isKnownScam(vpa)) return result;
    return RiskResult(
      level: RiskLevel.highRisk,
      score: 100,
      reasons: [
        'This UPI ID has been reported as a scam by other RakshaPay users',
        ...result.reasons,
      ],
    );
  }

  void dispose() {
    qrAnalyzer.dispose();
    _initialized = false;
  }
}
