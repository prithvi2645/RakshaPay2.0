// Shared helpers for the public threat-intel API.
//
// The API is a thin, documented, CORS-open shape over the same views the app
// reads. It exists so a bank or a UPI app can consume confirmed patterns
// without knowing anything about Supabase, and so the response shape is ours to
// keep stable even if the storage behind it changes.

import { NextResponse } from 'next/server';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const API_VERSION = '1.0';

export function json(body: unknown, init?: { status?: number; cache?: number }) {
  const response = NextResponse.json(body, { status: init?.status ?? 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  if (init?.cache) {
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${init.cache}, stale-while-revalidate=${init.cache * 4}`,
    );
  }
  return response;
}

export function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, { status });
}

/**
 * Returns the client, or a ready-made 503. An unconfigured deployment is a
 * real, supported state (the risk models do not need a backend), so it gets an
 * explicit, documented status rather than a 500.
 */
export function requireSupabase() {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured) {
    return {
      supabase: null,
      response: apiError(
        503,
        'backend_unconfigured',
        'This deployment has no community database configured. On-device scoring is unaffected.',
      ),
    } as const;
  }
  return { supabase, response: null } as const;
}

export function normalizeVpa(raw: string): string {
  return raw.toLowerCase().trim();
}
