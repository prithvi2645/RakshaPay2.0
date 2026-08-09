// Link risk = trained host model + deterministic rules.
//
// The combination mirrors the SMS pipeline deliberately: a model produces a
// number, then an explicit, readable layer overrides it in both directions. It
// is the same argument as the fraud-ask gate — a score nobody can explain is a
// score nobody should act on, and the rules are what make a verdict answerable
// when a user asks "why".

import type { InferenceSession, Tensor } from 'onnxruntime-web';

import { extractUrlFeatures, urlFeaturesToModelInput, type UrlFeatures } from './urlFeatures';
import { detectLinkRules, isOpaqueDestination, type LinkRule } from './urlRules';
import { riskResultFromScore, type RiskResult } from './types';

export const URL_FEATURE_COUNT = 12;

export interface LinkAnalysis {
  url: string;
  result: RiskResult;
  /** Host-model output before the rules layer. */
  modelScore: number;
  rules: LinkRule[];
  features: UrlFeatures;
  opaque: boolean;
}

export class LinkRiskAnalyzer {
  private session: InferenceSession | null = null;
  private TensorCtor: typeof Tensor | null = null;
  private loading: Promise<void> | null = null;

  get isLoaded(): boolean {
    return this.session !== null;
  }

  async load(modelUrl = '/models/url_risk_model.onnx'): Promise<void> {
    if (this.session) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const ort = await import('onnxruntime-web');
      ort.env.wasm.wasmPaths = '/ort/';
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

  async hostProbability(features: UrlFeatures): Promise<number> {
    const session = this.session;
    const TensorCtor = this.TensorCtor;
    if (!session || !TensorCtor) throw new Error('LinkRiskAnalyzer.load() must be awaited first');

    const input = new TensorCtor(
      'float32',
      Float32Array.from(urlFeaturesToModelInput(features)),
      [1, URL_FEATURE_COUNT],
    );

    const outputs = await session.run({ input });
    const probabilities = outputs['probabilities'] ?? outputs[session.outputNames[1]];
    const data = probabilities?.data as Float32Array | undefined;
    if (!data || data.length < 2) throw new Error('Unexpected link-model output shape');
    return Math.min(1, Math.max(0, data[1]));
  }

  async analyze(url: string): Promise<LinkAnalysis> {
    const features = extractUrlFeatures(url);
    const probability = await this.hostProbability(features);
    const modelScore = Math.round(probability * 100);

    const rules = detectLinkRules(url);
    return {
      url,
      features,
      rules,
      modelScore,
      opaque: isOpaqueDestination(rules),
      result: combine(modelScore, rules),
    };
  }
}

/**
 * Rules override the model in both directions, and the floors are chosen so a
 * single severe rule is decisive on its own — a `.apk` download link does not
 * become safe because it sits on a host the model has never seen.
 */
export function combine(modelScore: number, rules: LinkRule[]): RiskResult {
  const severe = rules.filter((rule) => rule.severity === 'severe');
  const strong = rules.filter((rule) => rule.severity === 'strong');
  const mild = rules.filter((rule) => rule.severity === 'mild');

  let score = modelScore;

  if (severe.length > 0) score = Math.max(score, 90);
  else if (strong.length > 0) score = Math.max(score, 70);

  score += mild.length * 8;

  // A shortened link cannot be called safe: we deliberately do not follow it,
  // so the destination is genuinely unknown rather than known-good. Saying
  // "Safe" about something we chose not to look at would be dishonest.
  if (isOpaqueDestination(rules)) score = Math.max(score, 40);

  score = Math.min(100, Math.max(0, Math.round(score)));

  const reasons =
    rules.length > 0
      ? rules.map((rule) => rule.explanation)
      : [
          score >= 70
            ? 'The address itself looks like the throwaway domains used for scam pages'
            : score >= 35
              ? 'Nothing specific is wrong, but the address is unusual compared to established sites'
              : 'No structural red flags in this address',
        ];

  return riskResultFromScore(score, reasons);
}
