// Direct port of app/lib/services/qr_risk_analyzer.dart.
//
// Runs the *same* RandomForest ONNX artifact the Android app ships, through
// onnxruntime-web (WASM) instead of ONNX Runtime Mobile. Nothing about the QR
// is uploaded: the model file is fetched once and inference happens in the tab.
//
// Feature extraction must stay in lockstep with the FEATURES list in
// ml/src/train_risk_model.py — same order, same definitions. A reordering would
// feed entropy into the digit-ratio slot and produce plausible-looking but
// wrong scores, the kind of bug that never throws, so the order is asserted in
// src/lib/risk/__tests__/qrFeatures.test.ts exactly as it is in the Dart tests.

import type { InferenceSession, Tensor } from 'onnxruntime-web';

import { riskResultFromScore, type RiskResult } from './types';

export const KNOWN_PSP_SUFFIXES = [
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl',
  'paytm', 'apl', 'upi', 'jio', 'idfcbank', 'kotak', 'hdfcbank',
];

const SUSPICIOUS_KEYWORDS = [
  'kyc', 'refund', 'reward', 'cashback', 'lottery', 'winner', 'urgent',
  'blocked', 'suspend', 'verify-now',
];

export const QR_FEATURE_COUNT = 7;

export interface QrFeatures {
  payload: string;
  vpa: string;
  suffix: string;
  isUpiUri: boolean;
  knownPspSuffix: boolean;
  entropy: number;
  digitRatio: number;
  localPartLength: number;
  hasAmount: boolean;
  amount: number;
  hasSuspiciousKeyword: boolean;
  /** Merchant name from the `pn` parameter, shown to the user for context. */
  payeeName: string;
}

/**
 * Parses the payload the way Dart's `Uri` does for these inputs, without
 * relying on `URL`'s handling of non-special schemes, which differs between
 * engines for opaque paths like `upi:pay?...`.
 */
function parseUpi(payload: string): { isUpiUri: boolean; params: URLSearchParams } {
  const trimmed = payload.trim();
  const isUpiUri = /^upi:/i.test(trimmed);
  if (!isUpiUri) return { isUpiUri: false, params: new URLSearchParams() };

  const q = trimmed.indexOf('?');
  const query = q === -1 ? '' : trimmed.slice(q + 1);
  return { isUpiUri: true, params: new URLSearchParams(query) };
}

export function extractQrFeatures(payload: string): QrFeatures {
  const { isUpiUri, params } = parseUpi(payload);
  const vpa = isUpiUri ? (params.get('pa') ?? '') : '';

  const localPart = vpa.includes('@') ? vpa.split('@')[0] : vpa;
  const suffix = vpa.includes('@') ? vpa.split('@').slice(-1)[0].toLowerCase() : '';

  const amountRaw = isUpiUri ? params.get('am') : null;
  const parsedAmount = amountRaw === null ? NaN : Number(amountRaw);
  const amount = Number.isFinite(parsedAmount) && amountRaw !== '' ? parsedAmount : 0;

  const lowerPayload = payload.toLowerCase();
  const hasSuspiciousKeyword = SUSPICIOUS_KEYWORDS.some((k) => lowerPayload.includes(k));

  return {
    payload,
    vpa,
    suffix,
    isUpiUri,
    knownPspSuffix: KNOWN_PSP_SUFFIXES.includes(suffix),
    entropy: shannonEntropy(localPart),
    digitRatio: digitRatio(localPart),
    localPartLength: localPart.length,
    hasAmount: amountRaw !== null && amountRaw.length > 0,
    amount,
    hasSuspiciousKeyword,
    payeeName: (isUpiUri ? params.get('pn') : null) ?? '',
  };
}

/** Order must match FEATURES in ml/src/train_risk_model.py exactly. */
export function qrFeaturesToModelInput(f: QrFeatures): number[] {
  return [
    f.knownPspSuffix ? 1 : 0,
    f.entropy,
    f.digitRatio,
    f.localPartLength,
    f.hasAmount ? 1 : 0,
    f.amount,
    f.hasSuspiciousKeyword ? 1 : 0,
  ];
}

export class QrRiskAnalyzer {
  private session: InferenceSession | null = null;
  private TensorCtor: typeof Tensor | null = null;
  private loading: Promise<void> | null = null;

  get isLoaded(): boolean {
    return this.session !== null;
  }

  /** Idempotent and safe to call concurrently — repeat callers await the same load. */
  async load(modelUrl = '/models/qr_risk_model.onnx'): Promise<void> {
    if (this.session) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const ort = await import('onnxruntime-web');
      // Served from public/ (see scripts/sync-assets.mjs) rather than bundled,
      // so the same path resolves in dev, in a production build and on Vercel.
      ort.env.wasm.wasmPaths = '/ort/';
      // Single-threaded: the model is a 7-feature forest, so inference is
      // sub-millisecond either way, and threads would require cross-origin
      // isolation headers on every page that embeds the checker.
      ort.env.wasm.numThreads = 1;

      this.TensorCtor = ort.Tensor;
      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /** Fraud probability in 0..1 from the trained model. */
  async fraudProbability(features: QrFeatures): Promise<number> {
    const session = this.session;
    const TensorCtor = this.TensorCtor;
    if (!session || !TensorCtor) throw new Error('QrRiskAnalyzer.load() must be awaited before use');

    // Must be Float32Array — the graph input is FloatTensorType (float32) per
    // ml/src/train_risk_model.py.
    const input = new TensorCtor('float32', Float32Array.from(qrFeaturesToModelInput(features)), [
      1,
      QR_FEATURE_COUNT,
    ]);

    const outputs = await session.run({ input });
    // zipmap is disabled at export time, so this is a plain [1, 2] tensor and
    // not a sequence of maps. Class order is [legit, fraud] per meta.json.
    const probabilities = outputs['probabilities'] ?? outputs[session.outputNames[1]];
    const data = probabilities?.data as Float32Array | undefined;
    if (!data || data.length < 2) {
      throw new Error(`Unexpected model output shape: ${JSON.stringify(probabilities?.dims)}`);
    }
    return Math.min(1, Math.max(0, data[1]));
  }

  async analyze(payload: string): Promise<RiskResult> {
    const features = extractQrFeatures(payload);
    const probability = await this.fraudProbability(features);
    const score = Math.round(probability * 100);
    return riskResultFromScore(score, explainQr(features, probability));
  }
}

export function explainQr(features: QrFeatures, probability: number): string[] {
  const reasons: string[] = [];

  if (!features.isUpiUri) reasons.push('This is not a standard UPI payment QR');

  if (features.vpa.length === 0) {
    reasons.push('No payee UPI ID found in the QR');
  } else if (!features.knownPspSuffix) {
    reasons.push(`Payee UPI ID uses an unrecognized handle (@${features.suffix})`);
  }

  if (features.entropy > 3.6) reasons.push('Payee ID looks randomly generated');
  if (features.digitRatio > 0.6 && features.localPartLength > 6) {
    reasons.push('Payee ID is mostly digits, unusual for a merchant');
  }
  if (features.hasSuspiciousKeyword) reasons.push('QR contains scam-related wording');
  if (features.hasAmount && features.amount > 0) {
    reasons.push(
      `QR pre-fills ₹${features.amount.toFixed(2)} — check it matches what you agreed to pay`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      probability < 0.35
        ? 'No structural red flags found in this QR'
        : 'Payee details look unusual compared to legitimate merchants',
    );
  }
  return reasons;
}

export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s.split('')) freq.set(ch, (freq.get(ch) ?? 0) + 1);

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * (Math.log(p) / Math.LN2);
  }
  return entropy;
}

export function digitRatio(s: string): number {
  if (s.length === 0) return 0;
  const digits = s.split('').filter((c) => c >= '0' && c <= '9').length;
  return digits / s.length;
}
