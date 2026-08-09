import type { NextRequest } from 'next/server';

import { API_VERSION, apiError, json, normalizeVpa, requireSupabase } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/lookup?vpa=name@bank[&kind=vpa|phone]
 *
 * The single call a payment app would make inline: is this payee on the
 * confirmed list?
 *
 * `listed: false` means exactly one thing — not confirmed by the community. It
 * is NOT a safety verdict, and the response says so, because the structural and
 * text models that produce a verdict run on the client and are not reachable
 * from here. An integrator that treats a miss as "safe" would be misreading it,
 * so the field is named `listed` rather than `safe`.
 */
export async function GET(request: NextRequest) {
  const { supabase, response } = requireSupabase();
  if (!supabase) return response;

  const params = request.nextUrl.searchParams;
  const raw = params.get('vpa') ?? params.get('id');
  const kind = params.get('kind') ?? 'vpa';

  if (!raw || raw.trim().length === 0) {
    return apiError(400, 'missing_vpa', 'Provide ?vpa= with the payee UPI ID or phone number');
  }
  if (raw.length > 100) {
    return apiError(400, 'invalid_vpa', 'vpa must be 100 characters or fewer');
  }
  if (kind !== 'vpa' && kind !== 'phone') {
    return apiError(400, 'invalid_kind', "kind must be 'vpa' or 'phone'");
  }

  const vpa = normalizeVpa(raw);

  const { data, error } = await supabase
    .from('active_patterns')
    .select('*')
    .eq('vpa', vpa)
    .eq('kind', kind)
    .maybeSingle();

  if (error) return apiError(502, 'upstream_error', error.message);

  return json(
    {
      api_version: API_VERSION,
      vpa,
      kind,
      listed: data !== null,
      report_count: data?.report_count ?? 0,
      reason_codes: data?.reason_codes ?? [],
      first_reported_at: data?.first_reported_at ?? null,
      last_reported_at: data?.last_reported_at ?? null,
      note:
        'listed=false means "not confirmed by the community", not "safe". Structural and text scoring runs on the client.',
    },
    { cache: 30 },
  );
}
