import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakshapay/models/risk_result.dart';
import 'package:rakshapay/services/link_risk_analyzer.dart';
import 'package:rakshapay/services/url_features.dart';
import 'package:rakshapay/services/url_rules.dart';

/// Pins the Dart host-feature extractor to the Python one, using the fixture
/// emitted by ml/src/export_url_fixtures.py — the same file the web suite
/// reads.
///
/// The link model ships as one ONNX artifact both clients run, so the model
/// itself cannot drift. Feature extraction is reimplemented three times
/// (Python, Dart, TypeScript) and IS where drift happens, silently: a wrong
/// host parse produces a plausible score rather than an error.
void main() {
  late Map<String, dynamic> fixture;
  late List<dynamic> cases;

  setUpAll(() {
    fixture = jsonDecode(
      File('test/fixtures/url_feature_parity.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    cases = fixture['cases'] as List<dynamic>;
  });

  group('host feature parity with Python', () {
    test('agrees on the feature order', () {
      expect(kUrlFeatures, (fixture['feature_order'] as List).cast<String>());
    });

    test('fixture set is non-empty', () => expect(cases, isNotEmpty));

    test('matches Python on every case', () {
      for (final testCase in cases) {
        final url = testCase['url'] as String;
        expect(hostOf(url), testCase['host'], reason: 'host for "$url"');

        final features = extractUrlFeatures(url);
        final expected = testCase['features'] as Map<String, dynamic>;
        for (final name in kUrlFeatures) {
          expect(
            features[name],
            closeTo((expected[name] as num).toDouble(), 1e-9),
            reason: 'feature $name for "$url"',
          );
        }

        final vector = urlFeaturesToModelInput(features);
        final expectedVector =
            (testCase['vector'] as List).map((v) => (v as num).toDouble()).toList();
        expect(vector.length, expectedVector.length);
        for (var i = 0; i < vector.length; i++) {
          expect(vector[i], closeTo(expectedVector[i], 1e-9),
              reason: 'vector[$i] for "$url"');
        }
      }
    });
  });

  group('hostOf handles the shapes phishing feeds are full of', () {
    test('takes the host after the LAST @, which is the whole point of the trick', () {
      expect(hostOf('https://sbi.co.in@evil-domain.tk/steal'), 'evil-domain.tk');
    });

    test('strips ports but keeps IPv6 brackets', () {
      expect(hostOf('http://192.168.14.201:8080/gate.php'), '192.168.14.201');
      expect(hostOf('https://[2001:db8::1]/payload'), '[2001:db8::1]');
    });

    test('resolves two-level public suffixes', () {
      final shop = registrableParts('shop.example.co.in');
      expect(shop.domain, 'example');
      expect(shop.tld, 'co.in');
    });
  });

  group('deterministic link rules', () {
    test('flags an APK download as severe', () {
      final rules = detectLinkRules('http://download.apk-bank-update.info/sbi-secure.apk');
      expect(
        rules.any((r) => r.id == 'apk_download' && r.severity == LinkRuleSeverity.severe),
        isTrue,
      );
    });

    test('flags the userinfo trick and names the real host', () {
      final rule = detectLinkRules('https://sbi.co.in@evil-domain.tk/steal')
          .firstWhere((r) => r.id == 'userinfo_trick');
      expect(rule.severity, LinkRuleSeverity.severe);
      expect(rule.explanation, contains('evil-domain.tk'));
    });

    test('does not fire brand_mismatch on a bank real domain', () {
      final rules = detectLinkRules('https://www.sbi.co.in/personal-banking');
      expect(rules.any((r) => r.id == 'brand_mismatch'), isFalse);
    });

    test('fires brand_mismatch when the brand is not the registrable domain', () {
      final rules = detectLinkRules('http://sbi.secure-verify-kyc.xyz/login');
      expect(rules.any((r) => r.id == 'brand_mismatch'), isTrue);
    });

    test('leaves an ordinary https site with no rules at all', () {
      expect(detectLinkRules('https://amazon.in/orders'), isEmpty);
    });
  });

  group('combining the model with the rules', () {
    test('a severe rule is decisive even when the host model says nothing', () {
      final result = combineLinkRisk(3, detectLinkRules('http://x.example.com/app.apk'));
      expect(result.score, greaterThanOrEqualTo(90));
      expect(result.level, RiskLevel.highRisk);
    });

    test('a shortened link is never called safe, because we chose not to follow it', () {
      final result = combineLinkRisk(0, detectLinkRules('http://bit.ly/3xKq2'));
      expect(result.level, isNot(RiskLevel.safe));
      expect(result.reasons.join(' '), contains('shortened'));
    });

    test('leaves a clean, well-known host alone', () {
      final result = combineLinkRisk(2, detectLinkRules('https://amazon.in/orders'));
      expect(result.level, RiskLevel.safe);
    });
  });

  group('extractUrls', () {
    test('pulls links out of an SMS body and drops trailing punctuation', () {
      expect(
        extractUrls('Your KYC is pending. Update at http://bit.ly/3xKq2, or call us.'),
        ['http://bit.ly/3xKq2'],
      );
    });

    test('returns nothing when there is no link', () {
      expect(extractUrls('Your OTP is 442190. Do not share it.'), isEmpty);
    });
  });
}
