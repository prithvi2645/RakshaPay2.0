// Mirrors app/lib/models/risk_result.dart. The band boundaries are part of the
// product's contract with the user — 70 is the "do not pay" line quoted in the
// docs and spoken by the voice alerts — so they are defined once, here, and
// imported everywhere else rather than being re-typed as literals.

export type RiskLevel = 'safe' | 'caution' | 'highRisk';

export const CAUTION_THRESHOLD = 35;
export const HIGH_RISK_THRESHOLD = 70;

export interface RiskResult {
  level: RiskLevel;
  /** 0-100, higher = riskier. */
  score: number;
  reasons: string[];
}

export function levelForScore(score: number): RiskLevel {
  if (score >= HIGH_RISK_THRESHOLD) return 'highRisk';
  if (score >= CAUTION_THRESHOLD) return 'caution';
  return 'safe';
}

export function riskResultFromScore(score: number, reasons: string[]): RiskResult {
  return { level: levelForScore(score), score, reasons };
}

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  safe: 'Safe',
  caution: 'Caution',
  highRisk: 'High Risk',
};

/** What was checked, so the headline can name the action being advised against. */
export type SubjectKind = 'payment' | 'message' | 'link';

const HEADLINES: Record<SubjectKind, Record<RiskLevel, string>> = {
  payment: {
    safe: 'No red flags found',
    caution: 'Check carefully before paying',
    highRisk: 'We recommend you do not pay',
  },
  message: {
    safe: 'No red flags found',
    caution: 'Treat this message carefully',
    highRisk: 'Do not act on this message',
  },
  link: {
    safe: 'No red flags found',
    caution: 'Be careful with this link',
    highRisk: 'We recommend you do not open this link',
  },
};

export function levelHeadline(level: RiskLevel, kind: SubjectKind = 'payment'): string {
  return HEADLINES[kind][level];
}
