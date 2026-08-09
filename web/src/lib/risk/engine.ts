// Direct port of app/lib/services/risk_engine.dart.
//
// Coordinates the two models and the community scam database. Everything here
// runs in the browser tab; the community check is against a list fetched once
// and held in memory, so a slow or missing backend can never block a verdict.

import { detectFraudSignals, type FraudSignal } from './fraudSignals';
import { LinkRiskAnalyzer, type LinkAnalysis } from './linkModel';
import { QrRiskAnalyzer, extractQrFeatures, type QrFeatures } from './qrModel';
import { extractUrls } from './urlFeatures';
import { classifySender, describeSender, senderRiskMultiplier, type SenderTrust } from './senderReputation';
import { ScamTextMatcher, type TextModelWeights } from './textModel';
import { riskResultFromScore, type RiskResult } from './types';

export interface AnalysisDetail {
  result: RiskResult;
  /** What the model said before the correction layer, for the "how" panel. */
  modelScore: number;
  /**
   * After the sender multiplier but before the fraud-ask gate. Kept separate
   * from `modelScore` so the explanation can say which of the two corrections
   * actually moved the number — attributing a drop to the cap when the
   * multiplier caused it would be a plausible-sounding lie.
   */
  adjustedScore: number;
  signals: FraudSignal[];
  senderTrust: SenderTrust;
  communityOverride: boolean;
  features?: QrFeatures;
  /** Populated by analyzeMessage when the text carried http(s) links. */
  links?: LinkAnalysis[];
}

/**
 * Folds link findings into a text verdict.
 *
 * Pure and exported so it can be tested without a WASM runtime — the ONNX part
 * is a lookup, this is the part with a judgement in it.
 *
 * A dangerous link is treated as a fraud ask, not as extra wording evidence.
 * That is the rule the whole pipeline runs on: a link that downloads an APK or
 * impersonates a bank is asking the reader to *do* something, so it lifts the
 * message past the no-ask cap of 55 exactly as an OTP request would. A merely
 * unusual link does not — otherwise every newsletter with a tracking domain
 * becomes an alert, which is the failure mode this project exists to avoid.
 */
export function mergeLinkIntoMessage(
  base: AnalysisDetail,
  links: LinkAnalysis[],
): AnalysisDetail {
  if (links.length === 0) return base;

  const worst = links.reduce((a, b) => (b.result.score > a.result.score ? b : a));
  if (worst.result.level === 'safe') return { ...base, links };

  const dangerous = worst.result.level === 'highRisk';
  const score = dangerous
    ? Math.max(base.result.score, 60, worst.result.score)
    : Math.max(base.result.score, Math.min(55, worst.result.score));

  // The text-only reasons are written on the assumption that no ask was found.
  // A dangerous link IS the ask, so leaving "it does not ask you for anything"
  // under a high-risk verdict would contradict it in the same breath.
  const supersededByLink = new Set([
    'No scam patterns detected',
    'Wording resembles promotional or scam messages, but it does not ask you for anything',
  ]);

  const reasons = [
    dangerous
      ? `The link in this message is dangerous: ${worst.result.reasons[0]}`
      : `The link in this message is worth checking: ${worst.result.reasons[0]}`,
    ...base.result.reasons.filter((reason) =>
      dangerous ? !supersededByLink.has(reason) : reason !== 'No scam patterns detected',
    ),
  ];

  return {
    ...base,
    links,
    result: riskResultFromScore(Math.min(100, Math.round(score)), reasons),
  };
}

export class RiskEngine {
  readonly qr = new QrRiskAnalyzer();
  readonly text = new ScamTextMatcher();
  readonly link = new LinkRiskAnalyzer();

  private knownScamVpas = new Set<string>();
  private initialized = false;

  get isInitialized(): boolean {
    return this.initialized;
  }

  async init(
    options: { textWeightsUrl?: string; qrModelUrl?: string; linkModelUrl?: string } = {},
  ): Promise<void> {
    if (this.initialized) return;

    const weightsUrl = options.textWeightsUrl ?? '/models/scam_text_model.json';
    const [weights] = await Promise.all([
      fetch(weightsUrl).then((r) => {
        if (!r.ok) throw new Error(`Failed to load text model (${r.status})`);
        return r.json() as Promise<TextModelWeights>;
      }),
      this.qr.load(options.qrModelUrl),
      this.link.load(options.linkModelUrl),
    ]);

    this.text.loadFromWeights(weights);
    this.initialized = true;
  }

  /** Replaces the cached community list. Safe to call before or after init. */
  setKnownScamVpas(vpas: Iterable<string>): void {
    this.knownScamVpas = new Set(
      [...vpas].map((v) => v.toLowerCase().trim()).filter((v) => v.length > 0),
    );
  }

  isKnownScam(vpa: string): boolean {
    return vpa.trim().length > 0 && this.knownScamVpas.has(vpa.toLowerCase().trim());
  }

  async analyzeQr(payload: string): Promise<AnalysisDetail> {
    const features = extractQrFeatures(payload);
    const base = await this.qr.analyze(payload);
    const { result, communityOverride } = this.applyCommunityOverride(base, features.vpa);

    return {
      result,
      modelScore: base.score,
      adjustedScore: base.score,
      signals: [],
      senderTrust: 'unknown',
      communityOverride,
      features,
    };
  }

  /**
   * Scores an SMS body.
   *
   * The text model alone over-flags Indian transactional SMS: it was trained on
   * a general spam corpus where "spam" means marketing, and bank alerts, OTPs
   * and recharge offers all carry marketing-shaped language. Two signals
   * correct that before anything reaches the user:
   *
   *  * who sent it — a DLT-registered header is very hard to forge
   *  * whether it actually asks for anything a scam needs (PIN, OTP, KYC panic,
   *    remote access, "pay to receive")
   *
   * A message with no such ask is never raised above Caution, regardless of
   * what the model scores.
   */
  analyzeText(text: string, options: { sender?: string | null; vpa?: string | null } = {}): AnalysisDetail {
    const base = this.text.analyze(text);

    const trust = classifySender(options.sender);
    const signals = detectFraudSignals(text);

    const adjusted = base.score * senderRiskMultiplier(trust);
    let score = adjusted;

    if (signals.length > 0) {
      score = score < 60 ? 60 : score;
      score += (signals.length - 1) * 12;
    } else {
      score = Math.min(55, Math.max(0, score));
    }

    const reasons: string[] = [
      ...signals.map((s) => s.explanation),
      ...(signals.length === 0 && score >= 35
        ? ['Wording resembles promotional or scam messages, but it does not ask you for anything']
        : []),
      ...(signals.length === 0 && score < 35 ? ['No scam patterns detected'] : []),
      ...(trust === 'registeredBusiness' ? [describeSender(trust)] : []),
      ...(trust === 'personalNumber' && signals.length > 0 ? [describeSender(trust)] : []),
    ];

    const rounded = Math.min(100, Math.max(0, Math.round(score)));
    const scored = riskResultFromScore(rounded, reasons);

    const vpa = options.vpa ?? null;
    const { result, communityOverride } = vpa
      ? this.applyCommunityOverride(scored, vpa)
      : { result: scored, communityOverride: false };

    return {
      result,
      modelScore: base.score,
      adjustedScore: Math.round(adjusted),
      signals,
      senderTrust: trust,
      communityOverride,
    };
  }

  /**
   * The full message path: text scoring plus every http(s) link in the body.
   *
   * `analyzeText` stays synchronous and stays a character-for-character match
   * with the Dart engine, so the parity tests keep meaning what they say. Link
   * scoring needs ONNX and therefore an await, so it composes on top rather
   * than being folded in.
   *
   * A dangerous link is treated as a fraud ask, not as extra wording evidence.
   * That is the same rule the rest of the pipeline runs on: a link that
   * downloads an APK or impersonates a bank is asking the reader to *do*
   * something, so it lifts the message past the no-ask cap of 55 the way an OTP
   * request would. A merely unusual link does not — otherwise every newsletter
   * with a tracking domain becomes an alert.
   */
  async analyzeMessage(
    text: string,
    options: { sender?: string | null; vpa?: string | null } = {},
  ): Promise<AnalysisDetail> {
    const base = this.analyzeText(text, options);

    const urls = extractUrls(text);
    if (urls.length === 0 || !this.link.isLoaded) return base;

    const links = await Promise.all(urls.slice(0, 5).map((url) => this.link.analyze(url)));
    const merged = mergeLinkIntoMessage(base, links);

    if (!options.vpa) return merged;

    const { result, communityOverride } = this.applyCommunityOverride(merged.result, options.vpa);
    return { ...merged, result, communityOverride };
  }

  /**
   * A VPA the community has confirmed as a scam outranks whatever the model
   * says — reported-by-real-people is stronger evidence than structure alone.
   */
  private applyCommunityOverride(
    result: RiskResult,
    vpa: string,
  ): { result: RiskResult; communityOverride: boolean } {
    if (!this.isKnownScam(vpa)) return { result, communityOverride: false };
    return {
      communityOverride: true,
      result: {
        level: 'highRisk',
        score: 100,
        reasons: [
          'This UPI ID has been reported as a scam by other RakshaPay users',
          ...result.reasons,
        ],
      },
    };
  }
}
