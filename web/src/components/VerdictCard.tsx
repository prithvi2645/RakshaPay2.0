'use client';

import { SafetyScoreRing } from './SafetyScoreRing';
import { AlertIcon, CheckIcon } from './icons';
import type { AnalysisDetail } from '@/lib/risk/engine';
import { LEVEL_LABEL, levelHeadline, type RiskLevel, type SubjectKind } from '@/lib/risk/types';
import { SIGNAL_LABEL } from '@/lib/risk/fraudSignals';
import { describeSender } from '@/lib/risk/senderReputation';

const TONE: Record<RiskLevel, { bg: string; border: string; text: string; chip: string }> = {
  safe: {
    bg: 'bg-safe-bg',
    border: 'border-safe/25',
    text: 'text-safe',
    chip: 'bg-safe text-white',
  },
  caution: {
    bg: 'bg-caution-bg',
    border: 'border-caution/25',
    text: 'text-caution',
    chip: 'bg-caution text-white',
  },
  highRisk: {
    bg: 'bg-danger-bg',
    border: 'border-danger-border',
    text: 'text-danger',
    chip: 'bg-danger text-white',
  },
};

export function VerdictCard({
  detail,
  subject,
  kind = 'payment',
  children,
}: {
  detail: AnalysisDetail;
  /** The thing that was checked — a VPA, or a short label for the input. */
  subject?: string;
  /** Chooses the wording: "do not pay" is wrong advice about a link. */
  kind?: SubjectKind;
  children?: React.ReactNode;
}) {
  const { result } = detail;
  const tone = TONE[result.level];

  return (
    <section className={`rounded-2xl border ${tone.border} ${tone.bg} p-6 shadow-card`}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <SafetyScoreRing score={result.score} level={result.level} />

        <div className="min-w-0 flex-1">
          <span className={`pill ${tone.chip}`}>
            {result.level === 'safe' ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <AlertIcon className="h-3.5 w-3.5" />
            )}
            {LEVEL_LABEL[result.level]}
          </span>

          <h2 className={`mt-3 font-display text-2xl font-bold leading-tight ${tone.text}`}>
            {levelHeadline(result.level, kind)}
          </h2>

          {subject && (
            <p className="mt-1.5 break-all font-mono text-sm text-navy/70">{subject}</p>
          )}

          <ul className="mt-4 space-y-2">
            {result.reasons.map((reason, i) => (
              <li key={`${i}-${reason}`} className="flex gap-2.5 text-sm leading-relaxed text-navy">
                <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tone.chip}`} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>

          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>

      <HowWeGotHere detail={detail} />
    </section>
  );
}

/**
 * Why the verdict came out the way it did, in the user's terms.
 *
 * Deliberately describes WHAT was considered, never how it is implemented — no
 * model names, no multipliers, no thresholds. Someone deciding whether to pay
 * needs to know that the sender was checked and that the message asked for a
 * PIN; the internals help them not at all, and the public site is not where the
 * method is documented.
 */
function HowWeGotHere({ detail }: { detail: AnalysisDetail }) {
  const { result, signals, senderTrust, communityOverride } = detail;

  return (
    <details className="mt-6 border-t border-line/15 pt-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-navy/80">
        What we looked at
      </summary>

      <div className="mt-3 space-y-2 text-sm leading-relaxed text-navy/80">
        <Row label="The wording">
          How closely this is written like messages that have turned out to be scams.
        </Row>

        {senderTrust !== 'unknown' && <Row label="The sender">{describeSender(senderTrust)}</Row>}

        {signals.length > 0 && (
          <Row label="What it asks of you">
            {signals.map((s) => SIGNAL_LABEL[s.kind]).join(', ')} — this is the part that matters
            most, and it is why the warning is this strong.
          </Row>
        )}

        {signals.length === 0 && (
          <Row label="What it asks of you">
            Nothing. It does not ask for a PIN, an OTP, a payment, or access to your phone — so
            however it is worded, we will not tell you to panic about it.
          </Row>
        )}

        {communityOverride && (
          <Row label="Other people">
            Several people have independently reported this UPI ID. Real reports outrank everything
            else here.
          </Row>
        )}

        <Row label="Result">{LEVEL_LABEL[result.level]}</Row>
      </div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="grid gap-0.5 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span>{children}</span>
    </p>
  );
}
