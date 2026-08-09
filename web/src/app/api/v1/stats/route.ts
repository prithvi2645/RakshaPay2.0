import { API_VERSION, apiError, json, requireSupabase } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/stats
 *
 * Aggregate counts only — never an individual report, score, VPA or timestamp.
 * The appeal counts are in here on purpose: how often the system flags the
 * wrong payee is the number a fraud tool is least inclined to publish and the
 * one that most deserves to be public.
 */
export async function GET() {
  const { supabase, response } = requireSupabase();
  if (!supabase) return response;

  const { data, error } = await supabase.from('live_stats').select('*').single();
  if (error) return apiError(502, 'upstream_error', error.message);

  return json({ api_version: API_VERSION, stats: data }, { cache: 30 });
}
