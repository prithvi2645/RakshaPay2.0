import 'package:flutter_test/flutter_test.dart';
import 'package:rakshapay/services/qr_risk_analyzer.dart';

void main() {
  final analyzer = QrRiskAnalyzer();

  test('feature order matches ml/src/train_risk_model.py FEATURES exactly', () {
    final features = analyzer.extractFeatures('upi://pay?pa=rahul.sharma@okaxis&pn=Rahul&am=100');
    final input = features.toModelInput();

    expect(input.length, QrFeatures.featureCount);
    expect(input[0], 1.0); // known_psp_suffix
    expect(input[1], closeTo(features.entropy, 1e-9)); // entropy
    expect(input[2], closeTo(features.digitRatio, 1e-9)); // digit_ratio
    expect(input[3], 'rahul.sharma'.length.toDouble()); // local_part_len
    expect(input[4], 1.0); // has_amount
    expect(input[5], 100.0); // amount
    expect(input[6], 0.0); // has_suspicious_keyword
  });

  test('recognizes known PSP suffixes', () {
    final f = analyzer.extractFeatures('upi://pay?pa=shop@okaxis');
    expect(f.knownPspSuffix, isTrue);
  });

  test('flags unknown PSP suffixes', () {
    final f = analyzer.extractFeatures('upi://pay?pa=refund@pay-verify');
    expect(f.knownPspSuffix, isFalse);
  });

  test('detects suspicious keywords in the payload', () {
    final f = analyzer.extractFeatures('upi://pay?pa=x@okaxis&tn=urgent%20kyc%20refund');
    expect(f.hasSuspiciousKeyword, isTrue);
  });

  test('non-UPI payloads carry no VPA', () {
    final f = analyzer.extractFeatures('https://example.com');
    expect(f.isUpiUri, isFalse);
    expect(f.vpa, isEmpty);
  });
}
