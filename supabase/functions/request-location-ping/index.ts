// supabase/functions/request-location-ping/index.ts
//
// Forces one or more staff devices to send a fresh GPS sample by sending an
// FCM "data" message with notification_type=location_ping.
//
// The mobile app listens for `pushNotificationReceived` events with this
// type and pushes a heartbeat point into locationSyncQueue, which uploads
// to mobile-app-api → staff_locations.
//
// Auth: requires the caller's Supabase JWT and that the caller belongs to
// the same organization_id as every targeted staff member (multi-tenant
// hard isolation — see mem://infrastructure/multi-tenancy-isolation-v6).
//
// Body shape:
//   { staff_ids: string[], reason?: string }
//
// Response:
//   { ok: true, requested: number, dispatched: number, skipped: number,
//     dispatch?: { sent: number, message?: string } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PingRequestBody {
  staff_ids: unknown;
  reason?: unknown;
}

/**
 * Pure validator — exported so unit tests can exercise it without a server.
 */
export interface ValidatedPingRequest {
  staff_ids: string[];
  reason: string;
}
export function validatePingBody(raw: unknown): { ok: true; data: ValidatedPingRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const body = raw as PingRequestBody;
  if (!Array.isArray(body.staff_ids)) {
    return { ok: false, error: 'staff_ids must be an array' };
  }
  if (body.staff_ids.length === 0) {
    return { ok: false, error: 'staff_ids must not be empty' };
  }
  if (body.staff_ids.length > 200) {
    return { ok: false, error: 'staff_ids may contain at most 200 entries' };
  }
  const cleaned: string[] = [];
  for (const id of body.staff_ids) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return { ok: false, error: 'staff_ids must contain non-empty strings' };
    }
    // Lightweight UUID sanity check (don't crash on malformed input).
    if (!/^[0-9a-f-]{8,}$/i.test(id.trim())) {
      return { ok: false, error: `staff_ids contains invalid id: ${id}` };
    }
    cleaned.push(id.trim());
  }
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'admin_request';
  return { ok: true, data: { staff_ids: cleaned, reason } };
}

/**
 * Pure builder — exported so unit tests can verify the FCM-bound payload
 * shape without dispatching a real push.
 */
export function buildPingPushPayload(
  staffIds: string[],
  organizationId: string,
  reason: string,
): {
  staff_ids: string[];
  title: string;
  body: string;
  notification_type: 'broadcast';
  data: Record<string, string>;
  organization_id: string;
} {
  return {
    staff_ids: staffIds,
    title: 'Plats-uppdatering',
    body: 'Systemet hämtade din position.',
    notification_type: 'broadcast',
    data: {
      notification_type: 'location_ping',
      reason,
      requested_at: new Date().toISOString(),
      // Silent-ish on iOS — the body is shown but the action surface is
      // intentionally minimal. The real work is the data payload.
      silent: 'true',
    },
    organization_id: organizationId,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Auth: require a logged-in user ─────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const jwt = authHeader.slice('Bearer '.length).trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identify the calling user via anon-key client (RLS-safe).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const callerId = userData.user.id;

  // ── Validate body ──────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body must be JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const parsed = validatePingBody(raw);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { staff_ids, reason } = parsed.data;

  // ── Resolve caller's organization (admin-side, via service-role) ──────────
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: callerProfile, error: profileErr } = await adminClient
    .from('staff_members')
    .select('id, organization_id')
    .eq('user_id', callerId)
    .maybeSingle();

  if (profileErr || !callerProfile?.organization_id) {
    return new Response(
      JSON.stringify({ error: 'Caller has no staff profile' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const organizationId = callerProfile.organization_id as string;

  // ── Multi-tenant isolation: keep only staff in the same org ───────────────
  const { data: orgStaff } = await adminClient
    .from('staff_members')
    .select('id')
    .eq('organization_id', organizationId)
    .in('id', staff_ids);
  const allowedSet = new Set((orgStaff || []).map((s: any) => s.id));
  const allowed = staff_ids.filter(id => allowedSet.has(id));
  const skipped = staff_ids.length - allowed.length;

  if (allowed.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, requested: staff_ids.length, dispatched: 0, skipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Dispatch via send-push-notification ────────────────────────────────────
  const payload = buildPingPushPayload(allowed, organizationId, reason);
  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
  let dispatch: { sent?: number; message?: string; error?: string } = {};
  try {
    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    try { dispatch = JSON.parse(txt); } catch { dispatch = { message: txt.slice(0, 200) }; }
    if (!res.ok) {
      console.error('[request-location-ping] push dispatch failed:', res.status, txt);
    }
  } catch (err) {
    console.error('[request-location-ping] push fetch threw:', err);
    dispatch = { error: (err as Error).message };
  }

  return new Response(
    JSON.stringify({
      ok: true,
      requested: staff_ids.length,
      dispatched: allowed.length,
      skipped,
      dispatch,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
