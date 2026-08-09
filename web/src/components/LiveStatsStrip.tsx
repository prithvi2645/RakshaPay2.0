'use client';

import { useEffect, useState } from 'react';

import type { LiveStats } from '@/lib/supabase';

/**
 * Reads the aggregate view through our own API route rather than Supabase
 * directly, so the same numbers a bank would get from /api/v1/stats are the
 * ones shown on the site. If the two ever disagree, one of them is lying.
 */
export function LiveStatsStrip({ dark = false }: { dark?: boolean }) {
  const { stats, state } = useLiveStats();

  if (state === 'unconfigured') {
    return (
      <p
        className={`rounded-2xl border px-5 py-4 text-sm leading-relaxed ${
          dark ? 'border-white/15 bg-white/5 text-white/60' : 'border-navy/10 bg-surface text-muted'
        }`}
      >
        The community database is not configured on this deployment, so there are no live counts to
        show. Every risk verdict still works — scoring runs on your device and has never depended
        on this.
      </p>
    );
  }

  const items: Array<{ value: number | undefined; label: string; note: string }> = [
    { value: stats?.payments_scored, label: 'Payments scored', note: 'across app and web' },
    { value: stats?.high_risk_blocked, label: 'Rated high risk', note: 'we advised not paying' },
    { value: stats?.patterns_active, label: 'Confirmed patterns', note: '3+ independent reporters' },
    { value: stats?.reporting_devices, label: 'Reporting devices', note: 'distinct, anonymous' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-2xl border px-5 py-4 ${
            dark ? 'border-white/12 bg-white/5 text-white' : 'border-navy/10 bg-surface'
          }`}
        >
          <p className="font-display text-3xl font-bold leading-none tabular-nums">
            {state === 'loading' ? (
              <span
                className={`inline-block h-7 w-14 animate-pulse rounded ${
                  dark ? 'bg-white/15' : 'bg-navy/10'
                }`}
              />
            ) : (
              (item.value ?? 0).toLocaleString('en-IN')
            )}
          </p>
          <p className="mt-2 text-sm font-semibold">{item.label}</p>
          <p className={`mt-0.5 text-xs ${dark ? 'text-white/50' : 'text-muted'}`}>{item.note}</p>
        </div>
      ))}
    </div>
  );
}

export type StatsState = 'loading' | 'ready' | 'unconfigured' | 'error';

export function useLiveStats(): { stats: LiveStats | null; state: StatsState } {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [state, setState] = useState<StatsState>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/v1/stats');
        if (cancelled) return;

        if (response.status === 503) {
          setState('unconfigured');
          return;
        }
        if (!response.ok) {
          setState('error');
          return;
        }

        const body = (await response.json()) as { stats: LiveStats };
        if (cancelled) return;
        setStats(body.stats);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, state };
}
