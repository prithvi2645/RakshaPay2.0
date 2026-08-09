'use client';

import { useEffect, useMemo, useState } from 'react';

import { useLiveStats, type StatsState } from './LiveStatsStrip';
import type { ActivePattern } from '@/lib/supabase';

const REASON_LABELS: Record<string, string> = {
  fake_merchant: 'Fake merchant',
  otp_request: 'OTP / PIN request',
  fake_refund: 'Fake refund',
  job_or_task_scam: 'Job / task scam',
  kyc_threat: 'KYC threat',
  remote_access: 'Remote access',
  other: 'Other',
};

export function ThreatFeed() {
  const { stats, state } = useLiveStats();
  const { patterns, patternState } = usePatterns();

  const reasonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of patterns) {
      for (const code of p.reason_codes ?? []) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [patterns]);

  if (state === 'unconfigured' || patternState === 'unconfigured') {
    return (
      <div className="card">
        <h2 className="font-display text-lg font-bold">No community database on this deployment</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The feed needs a configured Supabase project. Set{' '}
          <code className="rounded bg-canvas px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
          and <code className="rounded bg-canvas px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_KEY</code>{' '}
          and apply <code className="rounded bg-canvas px-1 py-0.5 text-xs">backend/supabase/schema.sql</code>.
          The checker is unaffected either way.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat state={state} value={stats?.payments_scored} label="Payments scored" />
        <Stat state={state} value={stats?.high_risk_blocked} label="Rated high risk" tone="danger" />
        <Stat state={state} value={stats?.caution_raised} label="Rated caution" tone="caution" />
        <Stat state={state} value={stats?.scored_safe} label="Rated safe" tone="safe" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <section className="card">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-bold">Confirmed patterns</h2>
            <span className="text-xs font-semibold text-muted">
              {patternState === 'loading' ? 'loading…' : `${patterns.length} active`}
            </span>
          </div>

          {patternState === 'ready' && patterns.length === 0 && (
            <p className="mt-4 rounded-xl bg-canvas px-4 py-6 text-center text-sm leading-relaxed text-muted">
              Nothing has crossed the three-reporter threshold yet. An empty feed is the honest
              state of a new deployment, not a rendering failure.
            </p>
          )}

          {patterns.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line/10 text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-3 font-semibold">Payee</th>
                    <th className="pb-2 pr-3 font-semibold">Reported for</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Reports</th>
                    <th className="pb-2 text-right font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((p) => (
                    <tr key={`${p.kind}:${p.vpa}`} className="border-b border-line/10 last:border-0">
                      <td className="py-3 pr-3">
                        <span className="break-all font-mono text-xs">{p.vpa}</span>
                        {p.kind === 'phone' && (
                          <span className="ml-2 rounded bg-navy/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            phone
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="flex flex-wrap gap-1">
                          {(p.reason_codes ?? []).map((code) => (
                            <span
                              key={code}
                              className="rounded-md bg-danger-bg px-1.5 py-0.5 text-[11px] font-medium text-danger"
                            >
                              {REASON_LABELS[code] ?? code}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                        {p.report_count}
                      </td>
                      <td className="py-3 text-right text-xs tabular-nums text-muted">
                        {relativeTime(p.last_reported_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="font-display text-lg font-bold">What they were reported for</h2>
            {reasonCounts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No confirmed reports yet.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {reasonCounts.map(([code, count]) => (
                  <li key={code}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{REASON_LABELS[code] ?? code}</span>
                      <span className="tabular-nums text-muted">{count}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-navy"
                        style={{ width: `${(count / reasonCounts[0][1]) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="font-display text-lg font-bold">Where we got it wrong</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Appeals from payees who say they were flagged unfairly. Published because a system
              that flags people owes an account of how often it flags the wrong one.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat state={state} value={stats?.appeals_open} label="Open" />
              <MiniStat state={state} value={stats?.appeals_upheld} label="Upheld" tone="safe" />
              <MiniStat state={state} value={stats?.appeals_rejected} label="Rejected" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              An upheld appeal clears the flag and marks the pattern overturned, so further reports
              cannot silently re-activate it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function usePatterns() {
  const [patterns, setPatterns] = useState<ActivePattern[]>([]);
  const [patternState, setPatternState] = useState<StatsState>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/v1/patterns?limit=100');
        if (cancelled) return;
        if (response.status === 503) return setPatternState('unconfigured');
        if (!response.ok) return setPatternState('error');

        const body = (await response.json()) as { patterns: ActivePattern[] };
        if (cancelled) return;
        setPatterns(body.patterns ?? []);
        setPatternState('ready');
      } catch {
        if (!cancelled) setPatternState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { patterns, patternState };
}

const TONES = {
  plain: 'text-navy',
  safe: 'text-safe',
  caution: 'text-caution',
  danger: 'text-danger',
} as const;

function Stat({
  state,
  value,
  label,
  tone = 'plain',
}: {
  state: StatsState;
  value: number | undefined;
  label: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="card py-5">
      <p className={`font-display text-3xl font-bold leading-none tabular-nums ${TONES[tone]}`}>
        {state === 'loading' ? (
          <span className="inline-block h-7 w-14 animate-pulse rounded bg-navy/10" />
        ) : (
          (value ?? 0).toLocaleString('en-IN')
        )}
      </p>
      <p className="mt-2 text-sm font-semibold">{label}</p>
    </div>
  );
}

function MiniStat({
  state,
  value,
  label,
  tone = 'plain',
}: {
  state: StatsState;
  value: number | undefined;
  label: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-3 text-center">
      <p className={`font-display text-xl font-bold leading-none tabular-nums ${TONES[tone]}`}>
        {state === 'loading' ? '—' : (value ?? 0).toLocaleString('en-IN')}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
