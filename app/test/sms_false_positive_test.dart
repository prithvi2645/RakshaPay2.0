import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakshapay/models/risk_result.dart';
import 'package:rakshapay/services/fraud_signals.dart';
import 'package:rakshapay/services/risk_engine.dart';
import 'package:rakshapay/services/scam_text_matcher.dart';
import 'package:rakshapay/services/sender_reputation.dart';

/// Guards against the exact failure mode a text model trained on general
/// spam produces: Indian transactional SMS — bank alerts, OTPs, recharge
/// offers — reads like marketing to a model trained on UK spam, so it gets
/// flagged. These tests pin the corrections that matter: sender trust and
/// requiring an actual fraud ask.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late RiskEngine engine;

  setUpAll(() async {
    final matcher = ScamTextMatcher();
    final jsonStr = await File('assets/models/scam_text_model.json').readAsString();
    matcher.loadFromJsonString(jsonStr);
    engine = RiskEngine(textMatcher: matcher);
  });

  group('sender classification', () {
    test('recognises DLT business headers', () {
      for (final sender in ['VM-HDFCBK', 'AD-SBIINB', 'JD-PAYTM', 'BP-ICICIB']) {
        expect(SenderReputation.classify(sender), SenderTrust.registeredBusiness, reason: sender);
      }
    });

    test('recognises personal mobile numbers', () {
      for (final sender in ['9876543210', '+919876543210', '7012345678']) {
        expect(SenderReputation.classify(sender), SenderTrust.personalNumber, reason: sender);
      }
    });
  });

  group('legitimate Indian SMS must not alert', () {
    const legitimate = <String, String>{
      'VM-HDFCBK': 'Rs.500.00 debited from a/c **1234 on 06-08-26 to VPA citycafe@okaxis. Avl bal Rs.4200.00. Not you? Call 18002586161.',
      'AD-SBIINB': 'Your OTP for SBI NetBanking is 481920. Valid for 10 mins. Do not share.',
      'VK-JIOINF': 'Recharge successful! Rs.299 plan activated. 1.5GB/day for 28 days. Enjoy unlimited calls.',
      'AX-AIRTEL': 'Special offer! Get 2GB extra data on Rs.399 recharge. Limited period offer.',
      'BZ-AMAZON': 'Your order has been shipped and will arrive by Friday. Track in the app.',
      'VM-ICICIB': 'Rs.2,499 spent on ICICI Card XX1234 at BIGBAZAAR on 06-Aug. Avl limit Rs.47,501.',
    };

    legitimate.forEach((sender, body) {
      test('"${body.substring(0, 40)}..." from $sender is not flagged', () {
        final result = engine.analyzeText(body, sender: sender);
        expect(result.level, isNot(RiskLevel.highRisk), reason: body);
      });
    });
  });

  group('real scams must still alert', () {
    const scams = [
      'Dear customer, your SBI KYC will be blocked in 24 hours. Update now: http://bit.ly/1234',
      'We noticed suspicious activity on your UPI account. Share the OTP sent to you to secure it.',
      'This is HDFC support. Please install AnyDesk and share your screen so we can process your refund.',
      'I have sent Rs.2000 to your account by mistake. Please accept the collect request to return it.',
    ];

    for (final body in scams) {
      test('"${body.substring(0, 40)}..." is flagged', () {
        final result = engine.analyzeText(body, sender: '9876543210');
        expect(result.level, isNot(RiskLevel.safe), reason: body);
      });
    }

    test('a KYC scam spoofing a bank header is still caught', () {
      final result = engine.analyzeText(
        'Your SBI account will be permanently blocked. Share your UPI PIN now to prevent this.',
        sender: 'VM-SBIINB',
      );
      expect(result.level, isNot(RiskLevel.safe));
    });
  });

  group('fraud signal detection', () {
    test('finds credential requests', () {
      expect(FraudSignals.hasActionableAsk('please share your OTP with us'), isTrue);
    });

    test('finds account threats', () {
      expect(FraudSignals.hasActionableAsk('your account will be blocked'), isTrue);
    });

    test('does not fire on a plain promotional offer', () {
      expect(FraudSignals.hasActionableAsk('get 50% off on your next recharge'), isFalse);
    });
  });
}
