// Pins the TypeScript host-feature extractor to the Python one, using the
// fixture file emitted by ml/src/export_url_fixtures.py — the same file the
// Dart test reads.
//
// The link model ships as one ONNX artifact both clients run, so the model
// cannot drift. Feature extraction is reimplemented three times (Python, Dart,
// TypeScript) and IS where drift happens, silently: a wrong host parse produces
// a plausible score rather than an error.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  URL_FEATURES,
  extractUrlFeatures,
  extractUrls,
  hostOf,
  registrableParts,
  urlFeaturesToModelInput,
} from '../urlFeatures';
import { combine, type LinkAnalysis } from '../linkModel';
import { mergeLinkIntoMessage } from '../engine';
import type { AnalysisDetail } from '../engine';
import { detectLinkRules } from '../urlRules';

const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
const FIXTURE_PATH = join(repoRoot, 'app', 'test', 'fixtures', 'url_feature_parity.json');

interface Fixture {
  feature_order: string[];
  cases: Array<{
    url: string;
    host: string;
    features: Record<string, number>;
    vector: number[];
  }>;
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;

describe('host feature parity with Python', () => {
  it('agrees on the feature order', () => {
    expect([...URL_FEATURES]).toEqual(fixture.feature_order);
  });

  it('has a non-empty fixture set', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases.map((c) => [c.url || '(empty string)', c] as const))(
    'matches Python on %s',
    (_label, testCase) => {
      expect(hostOf(testCase.url)).toBe(testCase.host);

      const features = extractUrlFeatures(testCase.url);
      for (const name of URL_FEATURES) {
        expect(features[name], `feature ${name}`).toBeCloseTo(testCase.features[name], 9);
      }

      const vector = urlFeaturesToModelInput(features);
      expect(vector).toHaveLength(testCase.vector.length);
      vector.forEach((value, i) => expect(value).toBeCloseTo(testCase.vector[i], 9));
    },
  );
});

describe('hostOf handles the shapes phishing feeds are full of', () => {
  it('takes the host after the LAST @, which is the whole point of the trick', () => {
    expect(hostOf('https://sbi.co.in@evil-domain.tk/steal')).toBe('evil-domain.tk');
  });

  it('strips ports but keeps IPv6 brackets', () => {
    expect(hostOf('http://192.168.14.201:8080/gate.php')).toBe('192.168.14.201');
    expect(hostOf('https://[2001:db8::1]/payload')).toBe('[2001:db8::1]');
  });

  it('resolves two-level public suffixes', () => {
    expect(registrableParts('shop.example.co.in')).toEqual(['example', 'co.in']);
    expect(registrableParts('www.sbi.co.in')).toEqual(['sbi', 'co.in']);
  });
});

describe('deterministic link rules', () => {
  it('flags an APK download as severe', () => {
    const rules = detectLinkRules('http://download.apk-bank-update.info/sbi-secure.apk');
    expect(rules.some((r) => r.id === 'apk_download' && r.severity === 'severe')).toBe(true);
  });

  it('flags the userinfo trick as severe and names the real host', () => {
    const rule = detectLinkRules('https://sbi.co.in@evil-domain.tk/steal').find(
      (r) => r.id === 'userinfo_trick',
    );
    expect(rule?.severity).toBe('severe');
    expect(rule?.explanation).toContain('evil-domain.tk');
  });

  it('does not fire brand_mismatch on a bank real domain', () => {
    const rules = detectLinkRules('https://www.sbi.co.in/personal-banking');
    expect(rules.some((r) => r.id === 'brand_mismatch')).toBe(false);
  });

  it('fires brand_mismatch when the brand is not the registrable domain', () => {
    const rules = detectLinkRules('http://sbi.secure-verify-kyc.xyz/login');
    expect(rules.some((r) => r.id === 'brand_mismatch')).toBe(true);
  });

  it('leaves an ordinary https site with no rules at all', () => {
    expect(detectLinkRules('https://amazon.in/orders')).toHaveLength(0);
  });
});

describe('combining the model with the rules', () => {
  it('a severe rule is decisive even when the host model says nothing', () => {
    const result = combine(3, detectLinkRules('http://x.example.com/app.apk'));
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe('highRisk');
  });

  it('a shortened link is never called safe, because we chose not to follow it', () => {
    const result = combine(0, detectLinkRules('http://bit.ly/3xKq2'));
    expect(result.level).not.toBe('safe');
    expect(result.reasons.join(' ')).toMatch(/shortened/i);
  });

  it('leaves a clean, well-known host alone', () => {
    const result = combine(2, detectLinkRules('https://amazon.in/orders'));
    expect(result.level).toBe('safe');
  });
});

describe('folding links into a message verdict', () => {
  const textOnly = (score: number, reasons: string[]): AnalysisDetail => ({
    result: { level: score >= 70 ? 'highRisk' : score >= 35 ? 'caution' : 'safe', score, reasons },
    modelScore: score,
    adjustedScore: score,
    signals: [],
    senderTrust: 'unknown',
    communityOverride: false,
  });

  const linkAt = (score: number, reason: string): LinkAnalysis => ({
    url: 'http://x.example/app.apk',
    result: {
      level: score >= 70 ? 'highRisk' : score >= 35 ? 'caution' : 'safe',
      score,
      reasons: [reason],
    },
    modelScore: score,
    rules: [],
    opaque: false,
    features: extractUrlFeatures('http://x.example/app.apk'),
  });

  it('lifts a no-ask message past the cap of 55 when the link is dangerous', () => {
    // This is the gap the link model exists to close: the text model alone
    // caps a message with no explicit ask at 55, so an APK-drop SMS written in
    // bland language would never have raised an alarm.
    const base = textOnly(
      52,
      ['Wording resembles promotional or scam messages, but it does not ask you for anything'],
    );
    const merged = mergeLinkIntoMessage(base, [linkAt(98, 'This link downloads an Android app')]);

    expect(merged.result.score).toBeGreaterThanOrEqual(60);
    expect(merged.result.level).toBe('highRisk');
    expect(merged.result.reasons[0]).toMatch(/dangerous/i);
  });

  it('drops the "does not ask you for anything" line it just contradicted', () => {
    const base = textOnly(
      52,
      ['Wording resembles promotional or scam messages, but it does not ask you for anything'],
    );
    const merged = mergeLinkIntoMessage(base, [linkAt(98, 'APK download')]);

    expect(merged.result.reasons.join(' ')).not.toMatch(/does not ask you for anything/);
  });

  it('a merely unusual link cannot push a message past the cap', () => {
    const base = textOnly(20, ['No scam patterns detected']);
    const merged = mergeLinkIntoMessage(base, [linkAt(50, 'Shortened link')]);

    expect(merged.result.score).toBeLessThanOrEqual(55);
    expect(merged.result.level).not.toBe('highRisk');
  });

  it('leaves a legitimate bank SMS alone when its link is clean', () => {
    const base = textOnly(3, ['No scam patterns detected']);
    const merged = mergeLinkIntoMessage(base, [linkAt(4, 'No structural red flags in this address')]);

    expect(merged.result.score).toBe(3);
    expect(merged.result.level).toBe('safe');
    expect(merged.links).toHaveLength(1);
  });

  it('is a no-op when the message carried no links', () => {
    const base = textOnly(12, ['No scam patterns detected']);
    expect(mergeLinkIntoMessage(base, [])).toBe(base);
  });
});

describe('extractUrls', () => {
  it('pulls links out of an SMS body and drops trailing punctuation', () => {
    expect(
      extractUrls('Your KYC is pending. Update at http://bit.ly/3xKq2, or call us.'),
    ).toEqual(['http://bit.ly/3xKq2']);
  });

  it('returns nothing when there is no link', () => {
    expect(extractUrls('Your OTP is 442190. Do not share it.')).toEqual([]);
  });
});
