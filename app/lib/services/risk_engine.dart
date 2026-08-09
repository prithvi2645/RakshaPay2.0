import 'dart:async';

import '../models/risk_result.dart';
import 'fraud_signals.dart';
import 'link_risk_analyzer.dart';
import 'qr_risk_analyzer.dart';
import 'scam_database_service.dart';
import 'scam_text_matcher.dart';
import 'sender_reputation.dart';
import 'url_features.dart';

/// Coordinates the two on-device models and the community scam database.
///
/// Everything here runs locally. The database check is against the locally
/// cached copy, so scoring works with no connectivity.
class RiskEngine {
  final QrRiskAnalyzer qrAnalyzer;
  final ScamTextMatcher textMatcher;
  final LinkRiskAnalyzer linkAnalyzer;
  final ScamDatabaseService scamDatabase;

  RiskEngine({
    QrRiskAnalyzer? qrAnalyzer,
    ScamTextMatcher? textMatcher,
    LinkRiskAnalyzer? linkAnalyzer,
    ScamDatabaseService? scamDatabase,
  })  : qrAnalyzer = qrAnalyzer ?? QrRiskAnalyzer(),
        textMatcher = textMatcher ?? ScamTextMatcher(),
        linkAnalyzer = linkAnalyzer ?? LinkRiskAnalyzer(),
        scamDatabase = scamDatabase ?? ScamDatabaseService();

  bool _initialized = false;
  bool get isInitialized => _initialized;

  Future<void> init() async {
    if (_initialized) return;
    await Future.wait([qrAnalyzer.load(), textMatcher.load(), linkAnalyzer.load()]);
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

  /// Scores an SMS body **including any links inside it**.
  ///
  /// [analyzeText] is left untouched and synchronous so it stays a
  /// character-for-character match with the web engine and the parity tests keep
  /// meaning what they say. Link scoring needs the ONNX session, so it composes
  /// on top rather than being folded in.
  ///
  /// A dangerous link is treated as a **fraud ask**, not as extra wording
  /// evidence — a link that installs an APK or impersonates a bank is asking the
  /// reader to *do* something, so it lifts the message past the no-ask cap of 55
  /// exactly as an OTP request would. A merely unusual link does not, or every
  /// newsletter with a tracking domain becomes an alert.
  ({RiskResult result, List<LinkAnalysis> links}) analyzeMessage(
    String text, {
    String? sender,
    String? vpa,
  }) {
    final base = analyzeText(text, sender: sender, vpa: vpa);

    final urls = extractUrls(text);
    if (urls.isEmpty || !linkAnalyzer.isLoaded) {
      return (result: base, links: const []);
    }

    // Cap the number scored: a spam blast can carry dozens, and the first few
    // are what the user will act on.
    final links = urls.take(5).map(linkAnalyzer.analyze).toList();
    return (result: mergeLinkIntoMessage(base, links), links: links);
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
    linkAnalyzer.dispose();
    _initialized = false;
  }
}

/// Folds link findings into a text verdict.
///
/// Top-level and pure so it can be tested without an ONNX session — the model
/// call is a lookup, this is the part with a judgement in it. Mirrors
/// `mergeLinkIntoMessage` in web/src/lib/risk/engine.ts.
RiskResult mergeLinkIntoMessage(RiskResult base, List<LinkAnalysis> links) {
  if (links.isEmpty) return base;

  final worst = links.reduce((a, b) => b.result.score > a.result.score ? b : a);
  if (worst.result.level == RiskLevel.safe) return base;

  final dangerous = worst.result.level == RiskLevel.highRisk;
  final score = dangerous
      ? [base.score, 60, worst.result.score].reduce((a, b) => a > b ? a : b)
      : [base.score, worst.result.score.clamp(0, 55)].reduce((a, b) => a > b ? a : b);

  // The text-only reasons are written assuming no ask was found. A dangerous
  // link IS the ask, so leaving "it does not ask you for anything" under a
  // high-risk verdict would contradict it in the same breath.
  const supersededByLink = {
    'No scam patterns detected',
    'Wording resembles promotional or scam messages, but it does not ask you for anything',
  };

  final reasons = <String>[
    dangerous
        ? 'The link in this message is dangerous: ${worst.result.reasons.first}'
        : 'The link in this message is worth checking: ${worst.result.reasons.first}',
    ...base.reasons.where((reason) => dangerous
        ? !supersededByLink.contains(reason)
        : reason != 'No scam patterns detected'),
  ];

  return RiskResult.fromScore(score.clamp(0, 100), reasons);
}
