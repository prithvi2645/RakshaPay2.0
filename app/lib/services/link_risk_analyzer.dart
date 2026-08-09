import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:onnxruntime/onnxruntime.dart';

import '../models/risk_result.dart';
import 'url_features.dart';
import 'url_rules.dart';

/// Link risk = trained host model + deterministic rules.
///
/// Runs the same `url_risk_model.onnx` the web client runs, through ONNX
/// Runtime Mobile. The combination below mirrors the SMS pipeline deliberately:
/// a model produces a number, then an explicit, readable layer overrides it in
/// both directions. It is the same argument as the fraud-ask gate — a score
/// nobody can explain is a score nobody should act on.
class LinkAnalysis {
  final String url;
  final RiskResult result;

  /// Host-model output before the rules layer, for the explanation panel.
  final int modelScore;
  final List<LinkRule> rules;
  final bool opaque;

  const LinkAnalysis({
    required this.url,
    required this.result,
    required this.modelScore,
    required this.rules,
    required this.opaque,
  });
}

class LinkRiskAnalyzer {
  static const _assetPath = 'assets/models/url_risk_model.onnx';
  static const featureCount = 12;

  OrtSession? _session;

  bool get isLoaded => _session != null;

  Future<void> load() async {
    if (isLoaded) return;
    OrtEnv.instance.init();
    final rawAsset = await rootBundle.load(_assetPath);
    final bytes = rawAsset.buffer
        .asUint8List(rawAsset.offsetInBytes, rawAsset.lengthInBytes);
    _session = OrtSession.fromBuffer(bytes, OrtSessionOptions());
  }

  void dispose() {
    _session?.release();
    _session = null;
  }

  /// Malicious probability in 0..1 from the trained host model.
  double hostProbability(Map<String, double> features) {
    final session = _session;
    if (session == null) {
      throw StateError('LinkRiskAnalyzer.load() must be awaited before use');
    }

    // Must be Float32List — the graph input is FloatTensorType (float32) per
    // ml/src/train_url_model.py. A plain List<double> maps to float64 and the
    // model rejects it at runtime.
    final input = OrtValueTensor.createTensorWithDataList(
      [Float32List.fromList(urlFeaturesToModelInput(features))],
      [1, featureCount],
    );

    final runOptions = OrtRunOptions();
    List<OrtValue?>? outputs;
    try {
      outputs = session.run(runOptions, {'input': input});
      final probabilities = (outputs[1] as OrtValueTensor?)?.value;
      if (probabilities is! List || probabilities.isEmpty) {
        throw StateError('Unexpected link-model output shape: $probabilities');
      }
      // Shape is [1, 2]; class order is [benign, malicious] per meta.json.
      final row = probabilities.first;
      if (row is! List || row.length < 2) {
        throw StateError('Unexpected probability row: $row');
      }
      return (row[1] as num).toDouble().clamp(0.0, 1.0);
    } finally {
      input.release();
      runOptions.release();
      if (outputs != null) {
        for (final output in outputs) {
          output?.release();
        }
      }
    }
  }

  LinkAnalysis analyze(String url) {
    final features = extractUrlFeatures(url);
    final modelScore = (hostProbability(features) * 100).round();
    final rules = detectLinkRules(url);

    return LinkAnalysis(
      url: url,
      modelScore: modelScore,
      rules: rules,
      opaque: isOpaqueDestination(rules),
      result: combineLinkRisk(modelScore, rules),
    );
  }
}

/// Rules override the model in both directions, and the floors are chosen so a
/// single severe rule is decisive on its own — an APK-download link does not
/// become safe because it sits on a host the model has never seen.
RiskResult combineLinkRisk(int modelScore, List<LinkRule> rules) {
  final severe = rules.where((r) => r.severity == LinkRuleSeverity.severe);
  final strong = rules.where((r) => r.severity == LinkRuleSeverity.strong);
  final mild = rules.where((r) => r.severity == LinkRuleSeverity.mild);

  var score = modelScore.toDouble();

  if (severe.isNotEmpty) {
    score = score < 90 ? 90 : score;
  } else if (strong.isNotEmpty) {
    score = score < 70 ? 70 : score;
  }

  score += mild.length * 8;

  // A shortened link cannot be called safe: we deliberately do not follow it,
  // so the destination is genuinely unknown rather than known-good. Saying
  // "Safe" about something we chose not to look at would be dishonest.
  if (isOpaqueDestination(rules) && score < 40) score = 40;

  final rounded = score.round().clamp(0, 100);

  final reasons = rules.isNotEmpty
      ? rules.map((r) => r.explanation).toList()
      : <String>[
          if (rounded >= 70)
            'The address itself looks like the throwaway domains used for scam pages'
          else if (rounded >= 35)
            'Nothing specific is wrong, but the address is unusual compared to established sites'
          else
            'No structural red flags in this address',
        ];

  return RiskResult.fromScore(rounded, reasons);
}
