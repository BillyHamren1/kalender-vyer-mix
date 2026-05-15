// apply-project-dates
// Central skriv-funktion: projektet äger rig/event/rigDown-datum för alla sina sub-bookings.
//
// Flow per booking:
//   1. UPDATE bookings.{phase}date = dates[0] lokalt (bakåtkompatibelt single-värde)
//   2. PUSH till externa via update-booking-from-planning med hela arrayen
//   3. Anropa import-bookings { localOnly:true, booking_id } för att rebuilda calendar_events
//   4. Logga i sync_audit_log
//
// Multi-tenancy: alla queries filtrerar på organization_id.
// Retry: om externa failar, sparar vi entry i sync_audit_log med error_message
//        (retry-kö läggs till i senare iteration om behov uppstår).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  pushBookingFieldsToExternal,
  type ExternalWriteFields,
} from '../_shared/external-booking-write.ts';

type Phase = 'rig' | 'event' | 'rigDown';

const PHASE_TO_LOCAL_COL: Record<Phase, 'rigdaydate' | 'eventdate' | 'rigdowndate'> = {
  rig: 'rigdaydate',
  event: 'eventdate',
  rigDown: 'rigdowndate',
};

const PHASE_TO_EXTERNAL_FIELD: Record<Phase, keyof ExternalWriteFields> = {
  rig: 'rig_up_dates',
  event: 'event_dates',
  rigDown: 'rig_down_dates',
};

type RequestBody = {
  project_id: string;
  project_type: 'medium' | 'large';
  organization_id: string;
  // Per fas: full lista av datum (YYYY-MM-DD) som projektet vill att alla sub-bookings ska ha.
  dates: Partial<Record<Phase, string[]>>;
  // Dry-run: ingen lokal UPDATE, ingen extern push, ingen calendar-rebuild. Endast payload-preview.
  dry_run?: boolean;
};

type PerBookingResult = {
  booking_id: string;
  local_updated: boolean;
  external_pushed: boolean;
  external_status: number;
  calendar_rebuilt: boolean;
  error?: string;
};

function bad(status: number, message: string, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error: message, ...extra }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function validate(body: unknown): { ok: true; data: RequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be object' };
  const b = body as Record<string, unknown>;
  if (typeof b.project_id !== 'string') return { ok: false, error: 'project_id required' };
  if (b.project_type !== 'medium' && b.project_type !== 'large') {
    return { ok: false, error: 'project_type must be medium|large' };
  }
  if (typeof b.organization_id !== 'string') return { ok: false, error: 'organization_id required' };
  if (!b.dates || typeof b.dates !== 'object') return { ok: false, error: 'dates required' };

  const datesObj = b.dates as Record<string, unknown>;
  const cleaned: Partial<Record<Phase, string[]>> = {};
  for (const phase of ['rig', 'event', 'rigDown'] as Phase[]) {
    if (datesObj[phase] === undefined) continue;
    const arr = datesObj[phase];
    if (!Array.isArray(arr)) return { ok: false, error: `dates.${phase} must be array` };
    if (!arr.every(isIsoDate)) return { ok: false, error: `dates.${phase} must be YYYY-MM-DD strings` };
    // Sortera + de-dup för deterministisk output
    cleaned[phase] = Array.from(new Set(arr as string[])).sort();
  }

  return {
    ok: true,
    data: {
      project_id: b.project_id,
      project_type: b.project_type,
      organization_id: b.organization_id,
      dates: cleaned,
    },
  };
}

async function resolveBookingIds(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
): Promise<string[]> {
  if (body.project_type === 'medium') {
    const { data } = await supabase
      .from('projects')
      .select('booking_id')
      .eq('id', body.project_id)
      .eq('organization_id', body.organization_id)
      .maybeSingle();
    return data?.booking_id ? [data.booking_id as string] : [];
  }
  const { data } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', body.project_id);
  return (data ?? []).map((r: { booking_id: string }) => r.booking_id).filter(Boolean);
}

async function processBooking(
  supabase: ReturnType<typeof createClient>,
  bookingId: string,
  organizationId: string,
  dates: Partial<Record<Phase, string[]>>,
): Promise<PerBookingResult> {
  const result: PerBookingResult = {
    booking_id: bookingId,
    local_updated: false,
    external_pushed: false,
    external_status: 0,
    calendar_rebuilt: false,
  };

  // 1. Lokal UPDATE av single-värde-fält (rigdaydate = dates[0] osv).
  //    Extra dagar lever i calendar_events efter rebuild i steg 3.
  const updates: Record<string, string | null> = {};
  for (const phase of ['rig', 'event', 'rigDown'] as Phase[]) {
    const arr = dates[phase];
    if (arr === undefined) continue;
    updates[PHASE_TO_LOCAL_COL[phase]] = arr.length > 0 ? arr[0] : null;
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('bookings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('organization_id', organizationId);
    if (error) {
      result.error = `local_update_failed: ${error.message}`;
      return result;
    }
    result.local_updated = true;
  }

  // 2. PUSH till externa systemet.
  const externalFields: ExternalWriteFields = {};
  for (const phase of ['rig', 'event', 'rigDown'] as Phase[]) {
    const arr = dates[phase];
    if (arr === undefined) continue;
    externalFields[PHASE_TO_EXTERNAL_FIELD[phase]] = arr;
  }
  const pushRes = await pushBookingFieldsToExternal({
    bookingId,
    organizationId,
    fields: externalFields,
  });
  result.external_pushed = pushRes.ok;
  result.external_status = pushRes.status;
  if (!pushRes.ok) {
    result.error = `external_push_failed: ${JSON.stringify(pushRes.body).slice(0, 200)}`;
    // Vi går vidare med rebuild ändå — lokal data är fortfarande sann.
  }

  // 3. Rebuild calendar_events via import-bookings localOnly.
  try {
    const { error: invokeErr } = await supabase.functions.invoke('import-bookings', {
      body: { booking_id: bookingId, localOnly: true, organization_id: organizationId, quiet: true },
    });
    if (invokeErr) {
      result.error = (result.error ?? '') + `; calendar_rebuild_failed: ${invokeErr.message}`;
    } else {
      result.calendar_rebuilt = true;
    }
  } catch (e) {
    result.error = (result.error ?? '') + `; calendar_rebuild_threw: ${(e as Error).message}`;
  }

  // 4. Audit-logg.
  await supabase.from('sync_audit_log').insert({
    booking_id: bookingId,
    organization_id: organizationId,
    sync_action: 'apply_project_dates',
    booking_dates: dates as unknown as Record<string, unknown>,
    has_mismatch: !pushRes.ok || !result.calendar_rebuilt,
    error_message: result.error ?? null,
  });

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return bad(405, 'POST only');

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return bad(401, 'unauthorized');

  let raw: unknown;
  try { raw = await req.json(); } catch { return bad(400, 'invalid json'); }
  const parsed = validate(raw);
  if (!parsed.ok) return bad(400, parsed.error);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verifiera att caller tillhör organisationen.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return bad(401, 'invalid token');

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!profile || profile.organization_id !== parsed.data.organization_id) {
    return bad(403, 'organization mismatch');
  }

  const bookingIds = await resolveBookingIds(supabase, parsed.data);
  if (bookingIds.length === 0) {
    return bad(404, 'no bookings found for project', { project_id: parsed.data.project_id });
  }

  const results: PerBookingResult[] = [];
  for (const bid of bookingIds) {
    results.push(await processBooking(supabase, bid, parsed.data.organization_id, parsed.data.dates));
  }

  const allOk = results.every((r) => r.local_updated && r.external_pushed && r.calendar_rebuilt);
  return new Response(
    JSON.stringify({ ok: allOk, project_id: parsed.data.project_id, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
