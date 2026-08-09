import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import '../models/risk_result.dart';

/// On-device scam-text classifier.
///
/// Runs the TF-IDF + LogisticRegression model trained in
/// ml/src/train_text_model.py. Weights ship as JSON (see
/// ml/src/export_text_weights.py) and the linear model is evaluated directly
/// here — this avoids depending on the Dart ONNX binding's unreliable string
/// tensor support. Results are numerically identical to the Python pipeline;
/// app/test/text_model_parity_test.dart pins this to 1e-6.
class ScamTextMatcher {
  static const _assetPath = 'assets/models/scam_text_model.json';
  static final _tokenPattern = RegExp(r'[a-zA-Z0-9]+');

  Map<String, int>? _vocabulary;
  List<double>? _idf;
  List<double>? _coef;
  double _intercept = 0;
  bool _sublinearTf = true;
  int _minN = 1;
  int _maxN = 2;

  bool get isLoaded => _vocabulary != null;

  Future<void> load() async {
    if (isLoaded) return;
    final raw = await rootBundle.loadString(_assetPath);
    loadFromJsonString(raw);
  }

  /// Loads weights from an already-read JSON string. Split out from [load]
  /// so tests can point it at the file on disk directly, without going
  /// through Flutter's asset bundle.
  void loadFromJsonString(String raw) {
    final json = jsonDecode(raw) as Map<String, dynamic>;

    _vocabulary = (json['vocabulary'] as Map<String, dynamic>).map((k, v) => MapEntry(k, v as int));
    _idf = (json['idf'] as List).map((v) => (v as num).toDouble()).toList();
    _coef = (json['coef'] as List).map((v) => (v as num).toDouble()).toList();
    _intercept = (json['intercept'] as num).toDouble();
    _sublinearTf = json['sublinear_tf'] as bool? ?? true;
    final ngramRange = json['ngram_range'] as List?;
    if (ngramRange != null && ngramRange.length == 2) {
      _minN = ngramRange[0] as int;
      _maxN = ngramRange[1] as int;
    }
  }

  List<String> _tokenize(String text) => _tokenPattern.allMatches(text.toLowerCase()).map((m) => m[0]!).toList();

  List<String> _ngrams(List<String> tokens) {
    final grams = <String>[];
    for (var n = _minN; n <= _maxN; n++) {
      for (var i = 0; i + n <= tokens.length; i++) {
        grams.add(tokens.sublist(i, i + n).join(' '));
      }
    }
    return grams;
  }

  /// Scam probability in 0..1. Exact reimplementation of sklearn's
  /// TfidfVectorizer (word n-grams, sublinear tf, idf, L2 norm) + logistic link.
  double scamProbability(String text) {
    final vocab = _vocabulary!, idf = _idf!, coef = _coef!;

    final counts = <int, int>{};
    for (final gram in _ngrams(_tokenize(text))) {
      final idx = vocab[gram];
      if (idx != null) counts[idx] = (counts[idx] ?? 0) + 1;
    }

    if (counts.isEmpty) {
      final z = _intercept;
      return 1 / (1 + exp(-z));
    }

    final tfidf = <int, double>{};
    for (final entry in counts.entries) {
      final tf = _sublinearTf ? 1 + log(entry.value) : entry.value.toDouble();
      tfidf[entry.key] = tf * idf[entry.key];
    }

    final norm = sqrt(tfidf.values.fold(0.0, (sum, v) => sum + v * v));
    if (norm == 0) {
      final z = _intercept;
      return 1 / (1 + exp(-z));
    }

    var z = _intercept;
    for (final entry in tfidf.entries) {
      z += (entry.value / norm) * coef[entry.key];
    }
    return 1 / (1 + exp(-z));
  }

  RiskResult analyze(String text) {
    final probability = scamProbability(text);
    final score = (probability * 100).round();
    return RiskResult.fromScore(score, _explain(text, probability));
  }

  List<String> _explain(String text, double probability) {
    if (probability < 0.35) return const ['No scam patterns detected in this message'];
    if (probability < 0.7) return const ['Wording resembles promotional or scam messages'];
    return const ['This message uses language commonly seen in scam attempts'];
  }

  static final _vpaPattern = RegExp(r'[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}');

  /// Pulls a UPI-ID-shaped substring out of free text (an SMS body, a raw QR
  /// payload) so a report can be pre-filled even when the caller only has
  /// text, not a structured payload.
  static String? extractVpa(String text) {
    final match = _vpaPattern.firstMatch(text);
    return match?.group(0);
  }
}
