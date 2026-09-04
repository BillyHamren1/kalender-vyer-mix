/**
 * Planning-owned, READ-ONLY Lager/warehouse context projection for Time.
 *
 * Contract: `planning-lager-context.v1` (see _shared/time-v2/lagerProjection.ts).
 *
 * Additive only:
 *  - no Planning source record is written (SELECT only),
 *  - no Time record is written,
 *  - legacy Time behaviour is untouched; Time must opt in by calling this.
 *
 * Nothing here infers Lager from GPS. The canonical location comes from
 * `organization_locations` linked by the internal Lager project
 * (`projects.is_internal = true`, `projects.location_id`). If Planning has no
 * canonical location, `location` is null and `configuration.missingFields`
 * lists the exact human-supplied fields still required.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { assertPlanningAccess } from '../_shared/planningAccess.ts';
import {
  buildLagerContextProjection,
  PLANNING_LAGER_CONTEXT_SCHEMA,
} from '../_shared/time-v2/lagerProjection.ts';
import { readLagerProjectionInputs } from '../_shared/time-v2/lagerContextReads.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, code: string, message: string) =>
  json(status, { schema: 'planning-lager-context-error.v1', code, error: message });

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Method not allowed');

  const authorization = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return fail(401, 'unauthorized', 'Authentication required');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return fail(503, 'service_not_configured', 'Planning runtime is not configured');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(authorization.slice(7));
  if (userError || !userData?.user) return fail(401, 'unauthorized', 'Invalid session');

  const access = await assertPlanningAccess(admin as unknown as never, userData.user.id);
  if (!access.ok) return fail(access.status, access.error, access.message);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_json', 'Invalid JSON body');
  }

  const from = body.from;
  const to = body.to;
  if (!isDate(from) || !isDate(to) || from > to) {
    return fail(400, 'invalid_range', 'from/to must be YYYY-MM-DD with from <= to');
  }
  const staffIds = Array.isArray(body.staffIds)
    ? (body.staffIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : null;

  // Tenant is resolved server-side; a client-supplied organizationId is ignored.
  const organizationId = access.organizationId;

  const [locations, internalProjects, staffMembers, staffAssignments, warehouseAssignments, warehouseEvents] =
    await Promise.all([
      admin
        .from('organization_locations')
        .select('id, organization_id, name, address, latitude, longitude, radius_meters, geofence_mode, location_type, is_active')
        .eq('organization_id', organizationId),
      admin
        .from('projects')
        .select('id, organization_id, name, is_internal, location_id')
        .eq('organization_id', organizationId)
        .eq('is_internal', true),
      admin
        .from('staff_members')
        .select('id, organization_id, name, is_active')
        .eq('organization_id', organizationId),
      admin
        .from('staff_assignments')
        .select('id, organization_id, staff_id, team_id, assignment_date')
        .eq('organization_id', organizationId)
        .gte('assignment_date', from)
        .lte('assignment_date', to),
      admin
        .from('warehouse_assignments')
        .select('id, organization_id, staff_id, assignment_date, assignment_type, status, title, description, start_time, end_time, booking_id, booking_number, delivery_address, customer_name, warehouse_event_id, packing_id, source')
        .eq('organization_id', organizationId)
        .gte('assignment_date', from)
        .lte('assignment_date', to),
      admin
        .from('warehouse_calendar_events')
        .select('id, organization_id, title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, warehouse_project_id')
        .eq('organization_id', organizationId)
        .gte('start_time', `${from}T00:00:00Z`)
        .lte('start_time', `${to}T23:59:59Z`),
    ]);

  const firstError =
    locations.error || internalProjects.error || staffMembers.error || staffAssignments.error ||
    warehouseAssignments.error || warehouseEvents.error;
  if (firstError) {
    console.error('[planning-lager-context] read failed', firstError);
    return fail(500, 'read_failed', 'Kunde inte läsa Planning-data för Lager-kontexten.');
  }

  const projection = buildLagerContextProjection({
    organizationId,
    from,
    to,
    staffIds,
    locations: (locations.data ?? []) as never,
    internalProjects: (internalProjects.data ?? []) as never,
    staffMembers: (staffMembers.data ?? []) as never,
    staffAssignments: (staffAssignments.data ?? []) as never,
    warehouseAssignments: (warehouseAssignments.data ?? []) as never,
    warehouseCalendarEvents: (warehouseEvents.data ?? []) as never,
  });

  return json(200, {
    schema: PLANNING_LAGER_CONTEXT_SCHEMA,
    generatedAt: new Date().toISOString(),
    data: projection,
  });
});
