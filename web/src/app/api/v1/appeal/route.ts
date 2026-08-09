import type { NextRequest } from 'next/server';

import { API_VERSION, apiError, json, normalizeVpa, requireSupabase } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/appeal — file an appeal against a flag.
 * GET  /api/v1/appeal?reference=RP-XXXXXXXXXXXX — check its status.
 *
 * Appeals go through this route rather than straight to Supabase from the
 * browser so the reference code comes back in one round trip and the validation
 * messages are ours. The database still enforces every constraint
 * independently: the table is insert-only under RLS, and status lookup is a
 * SECURITY DEFINER function that returns four fields for one reference and
 * nothing else.
 */
export async function POST(request: NextRequest) {
  const { supabase, response } = requireSupabase();
  if (!supabase) return response;

  let body: { vpa?: unknown; kind?: unknown; statement?: unknown; contact?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_json', 'Request body must be JSON');
  }

  const vpa = typeof body.vpa === 'string' ? normalizeVpa(body.vpa) : '';
  const statement = typeof body.statement === 'string' ? body.statement.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const kind = body.kind === 'phone' ? 'phone' : 'vpa';

  if (vpa.length === 0 || vpa.length > 100) {
    return apiError(400, 'invalid_vpa', 'vpa is required and must be 100 characters or fewer');
  }
  if (statement.length < 20 || statement.length > 2000) {
    return apiError(
      400,
      'invalid_statement',
      'statement must be between 20 and 2000 characters — enough to describe the business',
    );
  }
  if (contact.length > 200) {
    return apiError(400, 'invalid_contact', 'contact must be 200 characters or fewer');
  }

  // Through file_appeal rather than a direct insert. `pattern_appeals` has no
  // SELECT policy by design, so `insert(...).select(...)` — which is what
  // returning the reference code requires — is refused outright with 42501.
  // Adding a read policy to work around that would make every merchant's appeal
  // enumerable, which is the thing the design exists to prevent. The function
  // inserts and hands back three fields.
  const { data, error } = await supabase.rpc('file_appeal', {
    p_vpa: vpa,
    p_statement: statement,
    p_contact: contact.length > 0 ? contact : null,
    p_kind: kind,
  });

  if (error) return apiError(502, 'upstream_error', error.message);

  const appeal = Array.isArray(data) ? data[0] : data;
  if (!appeal) return apiError(502, 'upstream_error', 'Appeal was not created');

  return json({ api_version: API_VERSION, appeal }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { supabase, response } = requireSupabase();
  if (!supabase) return response;

  const reference = request.nextUrl.searchParams.get('reference')?.trim() ?? '';
  if (reference.length === 0) {
    return apiError(400, 'missing_reference', 'Provide ?reference= with the code from your appeal');
  }

  const { data, error } = await supabase.rpc('appeal_status', { p_reference: reference });
  if (error) return apiError(502, 'upstream_error', error.message);

  const appeal = Array.isArray(data) ? data[0] : data;
  if (!appeal) return apiError(404, 'not_found', 'No appeal with that reference');

  return json({ api_version: API_VERSION, appeal });
}
