// Client-side community layer: the known-scam list, reporting, and anonymous
// telemetry. Mirrors app/lib/services/scam_database_service.dart.
//
// Every function here is best-effort and swallows network failures. A failed
// sync must never block scoring a payment — the risk verdict is produced
// locally and does not depend on any of this succeeding.

'use client';

import { getSupabase } from './supabase';
import type { RiskResult } from './risk/types';

const DEVICE_TOKEN_KEY = 'rakshapay_device_token';
const PENDING_KEY = 'rakshapay_pending_reports';

/**
 * A random per-browser token — not a fingerprint, not a hardware or advertising
 * ID. It exists only so the backend can count *distinct reporters* toward the
 * three-device activation threshold. It identifies nothing about the user and
 * dies with the browser's local storage.
 */
export function deviceToken(): string {
  if (typeof window === 'undefined') return '';

  const existing = window.localStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing && existing.length >= 16) return existing;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');

  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

/** Active scam VPAs, lowercased. Returns an empty list when unconfigured. */
export async function syncKnownScamVpas(): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('scam_patterns')
      .select('vpa')
      .eq('active', true)
      .eq('kind', 'vpa');

    if (error) return [];
    return (data ?? [])
      .map((row) => (row.vpa as string | null)?.toLowerCase().trim())
      .filter((vpa): vpa is string => !!vpa && vpa.length > 0);
  } catch {
    return [];
  }
}

export type ReportOutcome = 'sent' | 'already-reported' | 'queued' | 'unconfigured';

export async function reportScam(vpa: string, reasonCode: string): Promise<ReportOutcome> {
  const trimmed = vpa.toLowerCase().trim();
  if (trimmed.length === 0) return 'unconfigured';

  const supabase = getSupabase();
  if (!supabase) return 'unconfigured';

  try {
    const { error } = await supabase.from('reports').insert({
      vpa: trimmed,
      kind: 'vpa',
      reason_code: reasonCode,
      device_hash: deviceToken(),
    });

    if (!error) return 'sent';

    // 23505 = unique violation: this browser already reported this VPA. The
    // report is on file and counted, so this is a success, not a failure —
    // queueing it would mean retrying forever.
    if (error.code === '23505') return 'already-reported';

    queueReport(trimmed, reasonCode);
    return 'queued';
  } catch {
    queueReport(trimmed, reasonCode);
    return 'queued';
  }
}

function queueReport(vpa: string, reasonCode: string): void {
  if (typeof window === 'undefined') return;
  const queued = readQueue();
  const entry = JSON.stringify({ vpa, reasonCode });
  if (!queued.includes(entry)) {
    queued.push(entry);
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(queued));
  }
}

function readQueue(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pendingReportCount(): number {
  return readQueue().length;
}

export async function flushPendingReports(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const queued = readQueue();
  if (queued.length === 0) return 0;

  const token = deviceToken();
  const remaining: string[] = [];
  let sent = 0;

  for (const entry of queued) {
    try {
      const data = JSON.parse(entry) as { vpa: string; reasonCode: string };
      const { error } = await supabase.from('reports').insert({
        vpa: data.vpa,
        kind: 'vpa',
        reason_code: data.reasonCode,
        device_hash: token,
      });
      if (!error || error.code === '23505') sent++;
      else remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }

  window.localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
  return sent;
}

/** Anonymized telemetry: risk level and score only, never the scanned content. */
export async function logRiskEvent(result: RiskResult, source: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from('risk_logs').insert({
      level: result.level,
      score: result.score,
      source,
    });
  } catch {
    // Telemetry is best-effort; never surface a failure to the user.
  }
}

export const REPORT_REASONS: Array<{ code: string; label: string }> = [
  { code: 'fake_merchant', label: 'Pretended to be a shop or business' },
  { code: 'otp_request', label: 'Asked for an OTP, PIN or card detail' },
  { code: 'fake_refund', label: 'Fake refund or cashback' },
  { code: 'job_or_task_scam', label: 'Job / task / investment scam' },
  { code: 'kyc_threat', label: 'KYC or account-block threat' },
  { code: 'remote_access', label: 'Asked me to install screen-sharing software' },
  { code: 'other', label: 'Something else' },
];
