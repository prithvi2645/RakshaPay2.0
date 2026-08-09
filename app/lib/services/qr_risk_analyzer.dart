import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:onnxruntime/onnxruntime.dart';

import '../models/risk_result.dart';

/// On-device QR/VPA structural risk scorer.
///
/// Runs the RandomForest model trained in ml/src/train_risk_model.py via ONNX
/// Runtime. Feature extraction below must stay in lockstep with the FEATURES
/// list in that script — same order, same definitions.
class QrRiskAnalyzer {
  static const _assetPath = 'assets/models/qr_risk_model.onnx';

  static const knownPspSuffixes = [
    'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl',
    'paytm', 'apl', 'upi', 'jio', 'idfcbank', 'kotak', 'hdfcbank',
  ];

  static const _suspiciousKeywords = [
    'kyc', 'refund', 'reward', 'cashback', 'lottery', 'winner', 'urgent',
    'blocked', 'suspend', 'verify-now',
  ];

  OrtSession? _session;

  bool get isLoaded => _session != null;

  Future<void> load() async {
    if (isLoaded) return;
    OrtEnv.instance.init();
    final rawAsset = await rootBundle.load(_assetPath);
    final bytes = rawAsset.buffer.asUint8List(rawAsset.offsetInBytes, rawAsset.lengthInBytes);
    _session = OrtSession.fromBuffer(bytes, OrtSessionOptions());
  }

  void dispose() {
    _session?.release();
    _session = null;
  }

  QrFeatures extractFeatures(String payload) {
    final uri = Uri.tryParse(payload);
    final isUpiUri = uri != null && uri.scheme == 'upi';
    final vpa = isUpiUri ? (uri.queryParameters['pa'] ?? '') : '';

    final localPart = vpa.contains('@') ? vpa.split('@').first : vpa;
    final suffix = vpa.contains('@') ? vpa.split('@').last.toLowerCase() : '';

    final amountRaw = isUpiUri ? uri.queryParameters['am'] : null;
    final amount = double.tryParse(amountRaw ?? '') ?? 0;

    final lowerPayload = payload.toLowerCase();
    final hasSuspiciousKeyword = _suspiciousKeywords.any((k) => lowerPayload.contains(k));

    return QrFeatures(
      payload: payload,
      vpa: vpa,
      isUpiUri: isUpiUri,
      knownPspSuffix: knownPspSuffixes.contains(suffix),
      suffix: suffix,
      entropy: _shannonEntropy(localPart),
      digitRatio: _digitRatio(localPart),
      localPartLength: localPart.length,
      hasAmount: amountRaw != null && amountRaw.isNotEmpty,
      amount: amount,
      hasSuspiciousKeyword: hasSuspiciousKeyword,
    );
  }

  /// Fraud probability in 0..1 from the trained model.
  double fraudProbability(QrFeatures features) {
    final session = _session;
    if (session == null) {
      throw StateError('QrRiskAnalyzer.load() must be awaited before use');
    }

    // Must be Float32List. The binding maps a plain List<double> to float64,
    // which the model rejects at runtime — the input is FloatTensorType
    // (float32) per ml/src/train_risk_model.py.
    final input = OrtValueTensor.createTensorWithDataList(
      [Float32List.fromList(features.toModelInput())],
      [1, QrFeatures.featureCount],
    );

    final runOptions = OrtRunOptions();
    List<OrtValue?>? outputs;
    try {
      outputs = session.run(runOptions, {'input': input});
      final probabilities = (outputs[1] as OrtValueTensor?)?.value;
      if (probabilities is! List || probabilities.isEmpty) {
        throw StateError('Unexpected model output shape: $probabilities');
      }
      // Shape is [1, 2]; class order is [legit, fraud] per meta.json.
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

  RiskResult analyze(String payload) {
    final features = extractFeatures(payload);
    final probability = fraudProbability(features);
    final score = (probability * 100).round();
    return RiskResult.fromScore(score, _explain(features, probability));
  }

  List<String> _explain(QrFeatures features, double probability) {
    final reasons = <String>[];

    if (!features.isUpiUri) {
      reasons.add('This is not a standard UPI payment QR');
    }
    if (features.vpa.isEmpty) {
      reasons.add('No payee UPI ID found in the QR');
    } else if (!features.knownPspSuffix) {
      reasons.add('Payee UPI ID uses an unrecognized handle (@${features.suffix})');
    }
    if (features.entropy > 3.6) {
      reasons.add('Payee ID looks randomly generated');
    }
    if (features.digitRatio > 0.6 && features.localPartLength > 6) {
      reasons.add('Payee ID is mostly digits, unusual for a merchant');
    }
    if (features.hasSuspiciousKeyword) {
      reasons.add('QR contains scam-related wording');
    }
    if (features.hasAmount && features.amount > 0) {
      reasons.add('QR pre-fills ₹${features.amount.toStringAsFixed(2)} — check it matches what you agreed to pay');
    }

    if (reasons.isEmpty) {
      reasons.add(probability < 0.35
          ? 'No structural red flags found in this QR'
          : 'Payee details look unusual compared to legitimate merchants');
    }
    return reasons;
  }

  static double _shannonEntropy(String s) {
    if (s.isEmpty) return 0;
    final freq = <String, int>{};
    for (final ch in s.split('')) {
      freq[ch] = (freq[ch] ?? 0) + 1;
    }
    var entropy = 0.0;
    for (final count in freq.values) {
      final p = count / s.length;
      entropy -= p * (log(p) / ln2);
    }
    return entropy;
  }

  static double _digitRatio(String s) {
    if (s.isEmpty) return 0;
    final digits = s.split('').where((c) => RegExp(r'[0-9]').hasMatch(c)).length;
    return digits / s.length;
  }
}

/// Structural features of a QR payload, mirroring FEATURES in
/// ml/src/train_risk_model.py.
class QrFeatures {
  static const featureCount = 7;

  final String payload;
  final String vpa;
  final String suffix;
  final bool isUpiUri;
  final bool knownPspSuffix;
  final double entropy;
  final double digitRatio;
  final int localPartLength;
  final bool hasAmount;
  final double amount;
  final bool hasSuspiciousKeyword;

  const QrFeatures({
    required this.payload,
    required this.vpa,
    required this.suffix,
    required this.isUpiUri,
    required this.knownPspSuffix,
    required this.entropy,
    required this.digitRatio,
    required this.localPartLength,
    required this.hasAmount,
    required this.amount,
    required this.hasSuspiciousKeyword,
  });

  /// Order must match FEATURES in ml/src/train_risk_model.py exactly.
  List<double> toModelInput() => [
        knownPspSuffix ? 1 : 0,
        entropy,
        digitRatio,
        localPartLength.toDouble(),
        hasAmount ? 1 : 0,
        amount,
        hasSuspiciousKeyword ? 1 : 0,
      ];
}
