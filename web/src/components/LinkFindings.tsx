'use client';

import type { LinkAnalysis } from '@/lib/risk/linkModel';
import type { LinkRuleSeverity } from '@/lib/risk/urlRules';
import { LEVEL_LABEL, type RiskLevel } from '@/lib/risk/types';

const LEVEL_TONE: Record<RiskLevel, string> = {
  safe: 'bg-safe text-on-accent',
  caution: 'bg-caution text-on-accent',
  highRisk: 'bg-danger text-on-accent',
};

const SEVERITY_TONE: Record<LinkRuleSeverity, string> = {
  severe: 'bg-danger-bg text-danger',
  strong: 'bg-caution-bg text-caution',
  mild: 'bg-canvas text-muted',
};

const SEVERITY_LABEL: Record<LinkRuleSeverity, string> = {
  severe: 'Decisive',
  strong: 'Strong',
  mild: 'Minor',
};

/**
 * Links are shown as their own panel rather than folded into the verdict's
 * reason list, because the two answer different questions: the verdict is about
 * the message, this is about where the message is trying to send you.
 */
export function LinkFindings({ links }: { links: LinkAnalysis[] }) {
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold">
        {links.length === 1 ? 'The link' : `Links found (${links.length})`}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Judged from the address alone. We never open a link to inspect it — that request would
        confirm to the sender that their message reached a real person.
      </p>

      <ul className="mt-4 space-y-4">
        {links.map((link, index) => (
          <li key={`${index}-${link.url}`} className="rounded-xl border border-navy/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${LEVEL_TONE[link.result.level]}`}>
                {LEVEL_LABEL[link.result.level]}
              </span>
            </div>

            <p className="mt-2.5 break-all font-mono text-xs text-navy/80">{link.url}</p>

            {link.rules.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {link.rules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-start gap-2 text-sm">
                    <span
                      className={`pill shrink-0 ${SEVERITY_TONE[rule.severity]}`}
                      title={`Rule: ${rule.id}`}
                    >
                      {SEVERITY_LABEL[rule.severity]}
                    </span>
                    <span className="min-w-0 flex-1 leading-relaxed text-navy">
                      {rule.explanation}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Nothing specific stood out. The verdict above reflects how the address itself
                compares with sites known to be used for scams.
              </p>
            )}

            {link.features.is_ip_literal === 0 && link.rules.length === 0 && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                A clean address is not a promise that the page behind it is safe — only that
                nothing about the address itself is suspicious.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
