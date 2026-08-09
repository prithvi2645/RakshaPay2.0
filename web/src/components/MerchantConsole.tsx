'use client';

import { useState } from 'react';

import { AlertIcon, CheckIcon } from './icons';
import { isSupabaseConfigured } from '@/lib/supabase';

type LookupResult = {
  vpa: string;
  listed: boolean;
  report_count: number;
  reason_codes: string[];
  first_reported_at: string | null;
  last_reported_at: string | null;
};

type Appeal = {
  reference: string;
  vpa?: string;
  status: 'received' | 'under_review' | 'upheld' | 'rejected';
  resolution_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

const STATUS_COPY: Record<Appeal['status'], { label: string; detail: string; tone: string }> = {
  received: {
    label: 'Received',
    detail: 'Your appeal is in the queue. Keep the reference below to check back.',
    tone: 'border-navy/15 bg-canvas text-navy',
  },
  under_review: {
    label: 'Under review',
    detail: 'A reviewer is looking at the reports filed against this UPI ID.',
    tone: 'border-caution/25 bg-caution-bg text-caution',
  },
  upheld: {
    label: 'Upheld — flag cleared',
    detail:
      'The flag has been removed and this UPI ID is marked overturned, so further reports cannot re-activate it.',
    tone: 'border-safe/25 bg-safe-bg text-safe',
  },
  rejected: {
    label: 'Rejected',
    detail: 'The reports were found credible and the flag stands. The reason is below.',
    tone: 'border-danger-border bg-danger-bg text-danger',
  },
};

export function MerchantConsole() {
  const [tab, setTab] = useState<'lookup' | 'status'>('lookup');

  if (!isSupabaseConfigured) {
    return (
      <div className="card">
        <h2 className="font-display text-lg font-bold">Appeals need the community database</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This deployment has no Supabase project configured, so there is no flag list to look up
          and nowhere to file an appeal. Set the two{' '}
          <code className="rounded bg-canvas px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_*</code>{' '}
          variables to enable it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'lookup'} onClick={() => setTab('lookup')}>
          Check my UPI ID
        </TabButton>
        <TabButton active={tab === 'status'} onClick={() => setTab('status')}>
          Track an appeal
        </TabButton>
      </div>

      {tab === 'lookup' ? <LookupAndAppeal /> : <StatusLookup />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-navy text-on-accent' : 'border border-navy/15 text-navy/70 hover:border-navy/35'
      }`}
    >
      {children}
    </button>
  );
}

function LookupAndAppeal() {
  const [vpa, setVpa] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    const query = vpa.trim();
    if (!query) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/v1/lookup?vpa=${encodeURIComponent(query)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Lookup failed');
      setResult(body as LookupResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <label className="label" htmlFor="merchant-vpa">
          Your UPI ID
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="merchant-vpa"
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="yourshop@okaxis"
            autoComplete="off"
            spellCheck={false}
            className="field flex-1 font-mono"
          />
          <button type="button" onClick={lookup} disabled={busy} className="btn-primary">
            {busy ? 'Checking…' : 'Check status'}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          This only reads the public confirmed list. It is the same call any bank or app can make
          against <code className="rounded bg-canvas px-1 py-0.5">/api/v1/lookup</code>.
        </p>

        {error && (
          <p className="mt-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {result && !result.listed && (
        <div className="card border-safe/25 bg-safe-bg">
          <p className="inline-flex items-center gap-2 font-display text-base font-bold text-safe">
            <CheckIcon className="h-4 w-4" />
            Not flagged
          </p>
          <p className="mt-2 text-sm leading-relaxed text-navy/80">
            <span className="break-all font-mono">{result.vpa}</span> is not on the confirmed list.
            No appeal is needed — and no reports against it are being withheld from you, because
            nothing below the threshold is published to anyone.
          </p>
        </div>
      )}

      {result?.listed && <AppealForm result={result} />}
    </div>
  );
}

function AppealForm({ result }: { result: LookupResult }) {
  const [statement, setStatement] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Appeal | null>(null);

  if (filed) return <AppealReceipt appeal={filed} />;

  return (
    <div className="card border-danger-border bg-danger-bg">
      <p className="inline-flex items-center gap-2 font-display text-base font-bold text-danger">
        <AlertIcon className="h-4 w-4" />
        Flagged — {result.report_count} reports
      </p>
      <p className="mt-2 text-sm leading-relaxed text-navy/80">
        <span className="break-all font-mono">{result.vpa}</span> was reported for{' '}
        <strong>{result.reason_codes.join(', ') || 'unspecified reasons'}</strong>, first on{' '}
        {formatDate(result.first_reported_at)}. If that is wrong, appeal it here.
      </p>

      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const response = await fetch('/api/v1/appeal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vpa: result.vpa, statement, contact }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error?.message ?? 'Could not file the appeal');
            setFiled(body.appeal as Appeal);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="statement">
            What is this UPI ID actually used for?
          </label>
          <textarea
            id="statement"
            rows={5}
            required
            minLength={20}
            maxLength={2000}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Describe the business, how long it has operated, and anything that would explain the reports — a QR sticker replaced at your counter, a payee ID that resembles yours, a dispute with a customer."
            className="field resize-y bg-surface"
          />
          <p className="mt-1 text-xs text-muted">{statement.trim().length} / 2000 · minimum 20</p>
        </div>

        <div>
          <label className="label" htmlFor="contact">
            Contact for the outcome (optional)
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            placeholder="email or phone"
            className="field bg-surface"
          />
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Optional on purpose. The reference code you get back is enough to track the appeal, so
            you can leave this blank and stay anonymous.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-danger-border bg-surface px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Filing…' : 'File appeal'}
        </button>
      </form>
    </div>
  );
}

function AppealReceipt({ appeal }: { appeal: Appeal }) {
  const copy = STATUS_COPY[appeal.status];
  return (
    <div className={`card border ${copy.tone}`}>
      <p className="font-display text-base font-bold">Appeal {copy.label.toLowerCase()}</p>
      <p className="mt-2 text-sm leading-relaxed text-navy/80">{copy.detail}</p>

      <div className="mt-4 rounded-xl bg-surface px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Reference</p>
        <p className="mt-0.5 font-mono text-lg font-bold">{appeal.reference}</p>
      </div>

      {appeal.resolution_note && (
        <p className="mt-4 text-sm leading-relaxed text-navy/80">
          <span className="font-semibold">Reviewer note: </span>
          {appeal.resolution_note}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Filed {formatDate(appeal.created_at)}
        {appeal.resolved_at ? ` · resolved ${formatDate(appeal.resolved_at)}` : ''}. Save the
        reference — it is the only way to look this up, which is also why nobody else can look it
        up.
      </p>
    </div>
  );
}

function StatusLookup() {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="card">
        <label className="label" htmlFor="reference">
          Appeal reference
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void check()}
            placeholder="RP-XXXXXXXXXXXX"
            autoComplete="off"
            spellCheck={false}
            className="field flex-1 font-mono"
          />
          <button type="button" onClick={() => void check()} disabled={busy} className="btn-primary">
            {busy ? 'Looking up…' : 'Check status'}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {appeal && <AppealReceipt appeal={appeal} />}
    </div>
  );

  async function check() {
    const ref = reference.trim();
    if (!ref) return;

    setBusy(true);
    setError(null);
    setAppeal(null);
    try {
      const response = await fetch(`/api/v1/appeal?reference=${encodeURIComponent(ref)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Lookup failed');
      setAppeal(body.appeal as Appeal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'an unknown date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unknown date';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
