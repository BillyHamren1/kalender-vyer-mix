/**
 * STEG 4F — booking-repair-dry-run
 *
 * Administrativt, server-side diagnostikverktyg för EN explicit bokning.
 *
 * GARANTIER:
 *  - 0 mutations (endast SELECT mot Planning)
 *  - 0 cursor movement
 *  - 0 jobs completed
 *  - 0 revision commit
 *  - ingen batch, inget wildcard, ingen "all bookings"
 *  - dry_run måste vara exakt true, annars 400 (fail-closed)
 *
 * AUTH: Supabase JWT krävs. Anroparen måste tillhöra angiven organization_id
 * och ha rollen admin (user_roles). Service role-nyckeln används endast för
 * läsning EFTER att tenant + roll verifierats.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  validateRepairRequest,
  buildBookingRepairDiff,
  type PlanningSnapshot,
} from '../_shared/bookingRepairDiff.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validation = validateRepairRequest(body);
  if (!validation.ok) {
    return json({ error: validation.code, message: validation.message, dry_run: true, mutations: 0 }, 400);
  }
  const { organizationId, bookingId } = validation;

  // ── Auth: JWT + tenant + admin ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) return json({ error: 'auth_lookup_failed' }, 500);
  if (!profile || profile.organization_id !== organizationId) {
    return json({ error: 'forbidden_tenant' }, 403);
  }

  const { data: roleRow, error: roleErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleErr) return json({ error: 'auth_lookup_failed' }, 500);
  if (!roleRow) return json({ error: 'forbidden_role' }, 403);

  // ── Planning-projektion (endast SELECT, alltid org-filtrerad) ───────────
  const warnings: string[] = [];
  const readErr = (label: string) => (e: unknown) => {
    warnings.push(`planning_read_failed:${label}`);
    console.error(`[booking-repair-dry-run] read failed ${label}`, e);
    return { data: null };
  };

  const [
    bookingRes,
    productsRes,
    eventsRes,
    projectsRes,
    jobsRes,
    packingRes,
    stateRes,
  ] = await Promise.all([
    admin.from('bookings').select('*').eq('id', bookingId).eq('organization_id', organizationId).maybeSingle().then((r) => r, readErr('bookings')),
    admin.from('booking_products').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).then((r) => r, readErr('booking_products')),
    admin.from('calendar_events').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).then((r) => r, readErr('calendar_events')),
    admin.from('projects').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).then((r) => r, readErr('projects')),
    admin.from('jobs').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).then((r) => r, readErr('jobs')),
    admin.from('packing_projects').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).then((r) => r, readErr('packing_projects')),
    admin.from('booking_source_state').select('*').eq('booking_id', bookingId).eq('organization_id', organizationId).maybeSingle().then((r) => r, readErr('booking_source_state')),
  ]);

  const planning: PlanningSnapshot = {
    booking: (bookingRes as any)?.data ?? null,
    products: ((productsRes as any)?.data ?? []) as Record<string, unknown>[],
    calendarEvents: ((eventsRes as any)?.data ?? []) as Record<string, unknown>[],
    projects: ((projectsRes as any)?.data ?? []) as Record<string, unknown>[],
    jobs: ((jobsRes as any)?.data ?? []) as Record<string, unknown>[],
    packingProjects: ((packingRes as any)?.data ?? []) as Record<string, unknown>[],
    sourceState: (stateRes as any)?.data ?? null,
  };

  // ── Canonical Booking single export (read-only) ─────────────────────────
  const importApiKey = Deno.env.get('IMPORT_API_KEY');
  let sourcePayload: unknown = null;
  let http: { ok: boolean; status: number } | undefined;

  if (!importApiKey) {
    warnings.push('import_api_key_missing');
    http = { ok: false, status: 0 };
  } else {
    const params = new URLSearchParams({ organization_id: organizationId, booking_id: bookingId });
    const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${params.toString()}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${importApiKey}`,
          'x-api-key': importApiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      http = { ok: resp.ok, status: resp.status };
      try {
        sourcePayload = await resp.json();
      } catch {
        sourcePayload = null;
      }
    } catch (e) {
      console.error('[booking-repair-dry-run] source fetch failed', e);
      warnings.push('source_fetch_failed');
      http = { ok: false, status: 0 };
    }
  }

  const diff = buildBookingRepairDiff({
    organizationId,
    bookingId,
    sourcePayload,
    http,
    planning,
  });
  diff.warnings.push(...warnings);

  console.log('[booking-repair-dry-run] diagnostic complete (0 mutations)', JSON.stringify({
    booking_id: bookingId,
    organization_id: organizationId,
    source_kind: diff.source.kind,
    revision: diff.revision.decision,
    warnings: diff.warnings,
  }));

  return json(diff, 200);
});
