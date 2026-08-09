import type { NextRequest } from 'next/server';

import { API_VERSION, apiError, json, requireSupabase } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/patterns
 *
 * Confirmed scam patterns — those reported independently by at least three
 * distinct devices. Patterns below that threshold are deliberately not exposed
 * anywhere, including here: publishing them would let anyone watch what is
 * being reported before the community has confirmed it, which is the whole
 * point of having a threshold.
 */
export async function GET(request: NextRequest) {
  const { supabase, response } = requireSupabase();
  if (!supabase) return response;

  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');
  const limitRaw = params.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 100;

  if (kind && kind !== 'vpa' && kind !== 'phone') {
    return apiError(400, 'invalid_kind', "kind must be 'vpa' or 'phone'");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return apiError(400, 'invalid_limit', 'limit must be an integer between 1 and 200');
  }

  let query = supabase.from('active_patterns').select('*').limit(limit);
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) return apiError(502, 'upstream_error', error.message);

  return json(
    {
      api_version: API_VERSION,
      count: data?.length ?? 0,
      threshold: 3,
      note: 'Only patterns confirmed by 3+ distinct reporting devices are listed.',
      patterns: data ?? [],
    },
    { cache: 60 },
  );
}
