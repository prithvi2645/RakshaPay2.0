// The web mirror of app/test/sms_false_positive_test.dart and
// app/test/qr_features_test.dart — deliberately the same cases, so a
// correction that is fixed on one client and forgotten on the other shows up as
// a failing test rather than as two products that disagree.
//
// The QR path is not covered here because it needs ONNX Runtime; feature
// extraction and the feature ORDER are, which is the part that fails silently.
// A reordering would feed entropy into the digit-ratio slot and produce
// plausible-looking but wrong scores without ever throwing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { RiskEngine } from '../engine';
import { hasActionableAsk, detectFraudSignals } from '../fraudSignals';
import { QR_FEATURE_COUNT, extractQrFeatures, qrFeaturesToModelInput } from '../qrModel';
import { classifySender } from '../senderReputation';
import type { TextModelWeights } from '../textModel';

const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
const MODEL_PATH = join(repoRoot, 'app', 'assets', 'models', 'scam_text_model.json');

describe('sender classification', () => {
  it('recognises DLT business headers', () => {
    for (const sender of ['VM-HDFCBK', 'AD-SBIINB', 'JD-PAYTM', 'BP-ICICIB']) {
      expect(classifySender(sender), sender).toBe('registeredBusiness');
    }
  });

  it('recognises personal mobile numbers', () => {
    for (const sender of ['9876543210', '+919876543210', '7012345678']) {
      expect(classifySender(sender), sender).toBe('personalNumber');
    }
  });

  it('treats an absent sender as unknown', () => {
    expect(classifySender(null)).toBe('unknown');
    expect(classifySender('   ')).toBe('unknown');
  });
});

describe('fraud signal detection', () => {
  it('finds credential requests', () => {
    expect(hasActionableAsk('please share your OTP with us')).toBe(true);
  });

  it('finds account threats', () => {
    expect(hasActionableAsk('your account will be blocked')).toBe(true);
  });

  it('does not fire on a plain promotional offer', () => {
    expect(hasActionableAsk('get 50% off on your next recharge')).toBe(false);
  });

  it('reports at most one signal per kind', () => {
    const signals = detectFraudSignals(
      'Your account will be blocked. Share your OTP and your UPI PIN and enter your CVV now.',
    );
    expect(new Set(signals.map((s) => s.kind)).size).toBe(signals.length);
  });
});

describe('risk engine text scoring', () => {
  let engine: RiskEngine;

  beforeAll(() => {
    engine = new RiskEngine();
    engine.text.loadFromWeights(JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as TextModelWeights);
  });

  const legitimate: Array<[string, string]> = [
    [
      'VM-HDFCBK',
      'Rs.500.00 debited from a/c **1234 on 06-08-26 to VPA citycafe@okaxis. Avl bal Rs.4200.00. Not you? Call 18002586161.',
    ],
    ['AD-SBIINB', 'Your OTP for SBI NetBanking is 481920. Valid for 10 mins. Do not share.'],
    [
      'VK-JIOINF',
      'Recharge successful! Rs.299 plan activated. 1.5GB/day for 28 days. Enjoy unlimited calls.',
    ],
    ['AX-AIRTEL', 'Special offer! Get 2GB extra data on Rs.399 recharge. Limited period offer.'],
    ['BZ-AMAZON', 'Your order has been shipped and will arrive by Friday. Track in the app.'],
    [
      'VM-ICICIB',
      'Rs.2,499 spent on ICICI Card XX1234 at BIGBAZAAR on 06-Aug. Avl limit Rs.47,501.',
    ],
  ];

  it.each(legitimate)('legitimate SMS from %s is never high risk', (sender, body) => {
    expect(engine.analyzeText(body, { sender }).result.level).not.toBe('highRisk');
  });

  const scams = [
    'Dear customer, your SBI KYC will be blocked in 24 hours. Update now: http://bit.ly/1234',
    'We noticed suspicious activity on your UPI account. Share the OTP sent to you to secure it.',
    'This is HDFC support. Please install AnyDesk and share your screen so we can process your refund.',
    'I have sent Rs.2000 to your account by mistake. Please accept the collect request to return it.',
  ];

  it.each(scams)('scam SMS is never rated safe: %s', (body) => {
    expect(engine.analyzeText(body, { sender: '9876543210' }).result.level).not.toBe('safe');
  });

  it('catches a KYC scam that spoofs a bank header', () => {
    const detail = engine.analyzeText(
      'Your SBI account will be permanently blocked. Share your UPI PIN now to prevent this.',
      { sender: 'VM-SBIINB' },
    );
    expect(detail.result.level).not.toBe('safe');
  });

  it('caps a message with no fraud ask at 55, below the block threshold', () => {
    const detail = engine.analyzeText(
      'Congratulations! You have won a special offer on your next recharge. Limited time only!',
      { sender: '9876543210' },
    );
    expect(detail.signals).toHaveLength(0);
    expect(detail.result.score).toBeLessThanOrEqual(55);
    expect(detail.result.level).not.toBe('highRisk');
  });

  it('lets the community list override the model', () => {
    engine.setKnownScamVpas(['kyc-refund9931@verifynow']);
    const detail = engine.analyzeText('Hello, please pay kyc-refund9931@verifynow for your order.', {
      vpa: 'kyc-refund9931@verifynow',
    });

    expect(detail.communityOverride).toBe(true);
    expect(detail.result.score).toBe(100);
    expect(detail.result.level).toBe('highRisk');
    engine.setKnownScamVpas([]);
  });
});

describe('QR feature extraction', () => {
  it('feature order matches ml/src/train_risk_model.py FEATURES exactly', () => {
    const features = extractQrFeatures('upi://pay?pa=rahul.sharma@okaxis&pn=Rahul&am=100');
    const input = qrFeaturesToModelInput(features);

    expect(input).toHaveLength(QR_FEATURE_COUNT);
    expect(input[0]).toBe(1); // known_psp_suffix
    expect(input[1]).toBeCloseTo(features.entropy, 9); // entropy
    expect(input[2]).toBeCloseTo(features.digitRatio, 9); // digit_ratio
    expect(input[3]).toBe('rahul.sharma'.length); // local_part_len
    expect(input[4]).toBe(1); // has_amount
    expect(input[5]).toBe(100); // amount
    expect(input[6]).toBe(0); // has_suspicious_keyword
  });

  it('recognizes known PSP suffixes', () => {
    expect(extractQrFeatures('upi://pay?pa=shop@okaxis').knownPspSuffix).toBe(true);
  });

  it('flags unknown PSP suffixes', () => {
    expect(extractQrFeatures('upi://pay?pa=refund@pay-verify').knownPspSuffix).toBe(false);
  });

  it('detects suspicious keywords in the payload', () => {
    expect(
      extractQrFeatures('upi://pay?pa=x@okaxis&tn=urgent%20kyc%20refund').hasSuspiciousKeyword,
    ).toBe(true);
  });

  it('non-UPI payloads carry no VPA', () => {
    const features = extractQrFeatures('https://example.com');
    expect(features.isUpiUri).toBe(false);
    expect(features.vpa).toBe('');
  });
});
