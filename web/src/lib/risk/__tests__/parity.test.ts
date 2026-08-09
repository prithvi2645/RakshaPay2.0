// Pins the TypeScript port of the TF-IDF + LogisticRegression model to the
// Python pipeline's predict_proba output, using the SAME fixture file that
// app/test/text_model_parity_test.dart uses.
//
// That shared fixture is the point. Two clients that each pass their own
// hand-written tests can still disagree with each other; pinning both to one
// set of reference probabilities from Python means a verdict on the web and a
// verdict in the app cannot silently diverge.
//
// A threshold test ("scam scores above 0.7") would not catch subtle drift — a
// wrong n-gram boundary or a missing sublinear-tf transform still lands on the
// right side of 0.7. Exact probabilities make any divergence fail loudly.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ScamTextMatcher, extractVpa, type TextModelWeights } from '../textModel';

const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
const MODEL_PATH = join(repoRoot, 'app', 'assets', 'models', 'scam_text_model.json');
const FIXTURE_PATH = join(repoRoot, 'app', 'test', 'fixtures', 'text_model_parity.json');

interface Fixture {
  text: string;
  scam_probability: number;
}

describe('text model parity with the Python pipeline', () => {
  let matcher: ScamTextMatcher;
  let fixtures: Fixture[];

  beforeAll(() => {
    matcher = new ScamTextMatcher();
    matcher.loadFromWeights(JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as TextModelWeights);
    fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture[];
  });

  it('has a non-empty fixture set', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('matches Python predict_proba to 1e-6 on every fixture', () => {
    for (const fixture of fixtures) {
      expect(matcher.scamProbability(fixture.text), `text: "${fixture.text}"`).toBeCloseTo(
        fixture.scam_probability,
        6,
      );
    }
  });

  it('handles empty and out-of-vocabulary text without dividing by zero', () => {
    expect(() => matcher.scamProbability('')).not.toThrow();
    expect(() => matcher.scamProbability('zzzz qqqq xxxx')).not.toThrow();
    expect(matcher.scamProbability('')).toBeGreaterThanOrEqual(0);
    expect(matcher.scamProbability('')).toBeLessThanOrEqual(1);
  });
});

describe('extractVpa', () => {
  it('pulls a UPI ID out of an SMS body', () => {
    expect(extractVpa('Pay to kyc-refund9931@verifynow now to claim')).toBe(
      'kyc-refund9931@verifynow',
    );
  });

  it('returns null when there is nothing UPI-shaped', () => {
    expect(extractVpa('Your OTP is 442190. Do not share it.')).toBeNull();
  });
});
