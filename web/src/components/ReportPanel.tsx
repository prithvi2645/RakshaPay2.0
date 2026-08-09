'use client';

import { useState } from 'react';

import { REPORT_REASONS, reportScam, type ReportOutcome } from '@/lib/community';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Reporting from the web uses the same insert-only `reports` table and the same
 * three-distinct-reporters threshold as the app. A single report never flags
 * anyone; the constraint that enforces that lives in the database, so this
 * form has no power the app doesn't.
 */
export function ReportPanel({ vpa }: { vpa: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0].code);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  if (!isSupabaseConfigured) return null;

  if (outcome === 'sent' || outcome === 'already-reported') {
    return (
      <div className="card border-safe/25 bg-safe-bg">
        <p className="text-sm font-semibold text-safe">
          {outcome === 'sent' ? 'Report filed. Thank you.' : 'You had already reported this one.'}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-navy/80">
          It counts as one report from one browser. Two more people have to report{' '}
          <span className="font-mono">{vpa}</span> independently before anyone is warned about it —
          that threshold is what stops one person flagging a real shop out of spite.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Were you actually targeted by this payee?</p>
            <p className="mt-1 text-sm text-muted">
              Reporting it helps warn the next person who scans the same QR.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost px-4 py-2 text-xs">
            Report this UPI ID
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setOutcome(await reportScam(vpa, reason));
            setBusy(false);
          }}
        >
          <p className="text-sm font-semibold">
            Reporting <span className="break-all font-mono">{vpa}</span>
          </p>

          <fieldset className="mt-3">
            <legend className="label">What did they do?</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.code}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                    reason === r.code ? 'border-navy bg-navy/5' : 'border-navy/12 hover:border-navy/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.code}
                    checked={reason === r.code}
                    onChange={() => setReason(r.code)}
                    className="mt-0.5 accent-[#16224A]"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            Only the UPI ID, the reason code above, and a random per-browser token are sent. The QR
            image, the message text and everything else stays here.
          </p>

          {outcome === 'queued' && (
            <p className="mt-3 rounded-xl border border-caution/25 bg-caution-bg px-4 py-3 text-sm text-caution">
              Couldn&apos;t reach the server. The report is saved in this browser and will be sent
              on your next visit.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2.5 text-xs">
              {busy ? 'Filing…' : 'File report'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-ghost px-4 py-2.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
