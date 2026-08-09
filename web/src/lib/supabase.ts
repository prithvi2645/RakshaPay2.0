// Supabase access for the web client.
//
// Same project, same tables, same RLS policies as the Android app — the web
// surface is a second client of one backend, not a second backend.
//
// Configuration is optional by design. Without it every page still works:
// scoring is entirely local, so the checker is fully functional and only the
// community layer (known-scam list, reporting, live stats) goes quiet. That
// mirrors the app's offline-first rule, where `ScamDatabaseService` returns
// null instead of throwing when the backend is unreachable.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? '';

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;

let client: SupabaseClient | null = null;

/** Returns null when unconfigured. Callers must treat null as "skip the network". */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'x-rakshapay-client': 'web' } },
    });
  }
  return client;
}

export interface ActivePattern {
  vpa: string;
  kind: 'vpa' | 'phone';
  report_count: number;
  reason_codes: string[];
  first_reported_at: string;
  last_reported_at: string;
}

export interface LiveStats {
  total_reports: number;
  reporting_devices: number;
  patterns_tracked: number;
  patterns_active: number;
  payments_scored: number;
  high_risk_blocked: number;
  caution_raised: number;
  scored_safe: number;
  appeals_open: number;
  appeals_upheld: number;
  appeals_rejected: number;
  as_of: string;
}

export async function fetchActivePatterns(): Promise<ActivePattern[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('active_patterns').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivePattern[];
}

export async function fetchLiveStats(): Promise<LiveStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from('live_stats').select('*').single();
  if (error) throw new Error(error.message);
  return data as LiveStats;
}
