import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakshapay/services/scam_text_matcher.dart';

/// Pins the Dart port of the TF-IDF + LogisticRegression model to the Python
/// pipeline's predict_proba output. A threshold test ("scam scores above
/// 0.7") would not catch subtle drift — a wrong ngram boundary or a missing
/// sublinear-tf still lands on the right side of 0.7. These fixtures pin the
/// exact probabilities so any divergence fails loudly.
void main() {
  late ScamTextMatcher matcher;
  late List<dynamic> fixtures;

  setUpAll(() async {
    matcher = ScamTextMatcher();
    final jsonStr = await File('assets/models/scam_text_model.json').readAsString();
    matcher.loadFromJsonString(jsonStr);

    final fixtureStr = await File('test/fixtures/text_model_parity.json').readAsString();
    fixtures = jsonDecode(fixtureStr) as List<dynamic>;
  });

  test('fixture set is non-empty', () {
    expect(fixtures, isNotEmpty);
  });

  test('matches Python predict_proba to 1e-6 on every fixture', () {
    for (final fixture in fixtures) {
      final text = fixture['text'] as String;
      final expected = (fixture['scam_probability'] as num).toDouble();
      final actual = matcher.scamProbability(text);
      expect(actual, closeTo(expected, 1e-6), reason: 'text: "$text"');
    }
  });

  test('handles empty and out-of-vocabulary text without dividing by zero', () {
    expect(() => matcher.scamProbability(''), returnsNormally);
    expect(() => matcher.scamProbability('zzzz qqqq xxxx'), returnsNormally);
  });
}
