/**
 * planning-mobile-staff.v1 — reviewed calendar staffing commands
 * for EventFlow Agent Core (BRAIN). Explicit atomic assignment commands; no provider/model calls, no
 * service-role exposure to any client, no cross-tenant reads.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { PLANNING_BRAIN_NONCE_TTL_SECONDS, decidePlanningBrainActor, verifyPlanningBrainSignature, } from '../_shared/planning-brain-read-contract.ts';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
export async function handleRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST')
        return json(405, { error: 'method_not_allowed' });
    const secret = Deno.env.get('PLANNING_BRAIN_READ_SIGNING_SECRET') ?? '';
    if (!secret)
        return json(503, { error: 'not_configured' });
    const rawBody = await request.text();
    const authorized = await verifyPlanningBrainSignature({
        secret,
        rawBody,
        timestamp: request.headers.get('x-planning-timestamp'),
        nonce: request.headers.get('x-planning-nonce'),
        signature: request.headers.get('x-planning-signature'),
    });
    if (!authorized)
        return json(401, { error: 'invalid_signature' });
    const body = (() => {
        try {
            return JSON.parse(rawBody || 'null');
        }
        catch {
            return null;
        }
    })();
    if (body?.schema !== 'planning-mobile-staff-request.v1')
        return json(400, { error: 'unsupported_schema' });
    const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    if (Object.keys(body).some(key => !['schema', 'actorUserId', 'organizationId', 'action', 'calendarEventId', 'staffId', 'operation', 'idempotencyKey', 'expectedMembershipId', 'expectedTeamId', 'expectedDate', 'expectedAffectedBookingIds'].includes(key)))
        return json(400, { error: 'unexpected_field' });
    if (!uuid(body.actorUserId) || !uuid(body.organizationId) || !uuid(body.calendarEventId) || !['options', 'command'].includes(body.action))
        return json(400, { error: 'invalid_request' });
    const parsed = { value: { actorUserId: body.actorUserId, organizationId: body.organizationId } };
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey)
        return json(503, { error: 'service_not_configured' });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const org = parsed.value.organizationId;
    // Replay safety: server-owned one-time nonce consumption (security primitive,
    // replay protection before the separately gated business command).
    const nonceResult = await admin.rpc('consume_planning_brain_read_nonce', {
        _nonce: request.headers.get('x-planning-nonce'),
        _organization_id: org,
        _ttl_seconds: PLANNING_BRAIN_NONCE_TTL_SECONDS,
    });
    if (nonceResult.error)
        return json(503, { error: 'nonce_store_unavailable' });
    if (nonceResult.data !== true)
        return json(401, { error: 'nonce_replayed' });
    const orgResult = await admin.from('organizations').select('id').eq('id', org).maybeSingle();
    if (orgResult.error)
        return json(503, { error: 'organization_lookup_failed' });
    if (!orgResult.data)
        return json(404, { error: 'organization_not_found' });
    // Actor authority is verified before reading any project or staff labels.
    const actor = parsed.value.actorUserId;
    const [profileResult, rolesResult] = await Promise.all([
        admin.from('profiles').select('organization_id').eq('user_id', actor).maybeSingle(),
        admin.from('user_roles')
            .select('role, organization_id')
            .eq('user_id', actor)
            .eq('organization_id', org)
            .in('role', ['admin', 'projekt']),
    ]);
    if (profileResult.error || rolesResult.error)
        return json(503, { error: 'actor_lookup_failed' });
    const actorDecision = decidePlanningBrainActor({
        organizationId: org,
        profileOrganizationId: (profileResult.data as {
            organization_id?: string | null;
        } | null)?.organization_id ?? null,
        roleRows: rolesResult.data ?? [],
    });
    if (!actorDecision.ok)
        return json(403, { error: actorDecision.error });
    if (!(rolesResult.data ?? []).some(row => row.role === 'admin' || row.role === 'projekt'))
        return json(403, { error: 'actor_not_authorized' });
    if (body.action === 'command') {
        if (Deno.env.get('PLANNING_MOBILE_STAFF_WRITE') !== 'true')
            return json(503, { error: 'write_disabled' });
        if (!uuid(body.idempotencyKey) || typeof body.staffId !== 'string' || !body.staffId.trim() || body.staffId.length > 128 || !['assign', 'remove'].includes(body.operation) || !(body.expectedMembershipId === null || uuid(body.expectedMembershipId)) || typeof body.expectedTeamId !== 'string' || typeof body.expectedDate !== 'string' || !Array.isArray(body.expectedAffectedBookingIds) || body.expectedAffectedBookingIds.length > 500 || body.expectedAffectedBookingIds.some(id => typeof id !== 'string' || id.length > 128))
            return json(400, { error: 'invalid_request' });
        const result = await admin.rpc('planning_mobile_staff_command_v1', {
            p_actor_user_id: actor, p_organization_id: org, p_event_id: body.calendarEventId,
            p_staff_id: body.staffId, p_operation: body.operation, p_idempotency_key: body.idempotencyKey,
            p_expected_membership_id: body.expectedMembershipId, p_expected_team_id: body.expectedTeamId, p_expected_date: body.expectedDate, p_expected_booking_ids: body.expectedAffectedBookingIds,
        });
        if (result.error)
            return json(result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400, { error: result.error.code === '40001' ? 'conflict' : 'command_rejected' });
        if (result.data?.persisted !== true)
            return json(503, { error: 'not_persisted' });
        return json(200, { schema: 'planning-mobile-staff-receipt.v1', receipt: result.data });
    }
    const event = await admin.from('calendar_events').select('id,resource_id,source_date').eq('organization_id', org).eq('id', body.calendarEventId).maybeSingle();
    if (event.error)
        return json(503, { error: 'calendar_unavailable' });
    if (!event.data?.resource_id || !event.data.source_date || ['activity', 'project', 'location', 'project_team'].includes(event.data.resource_id))
        return json(404, { error: 'calendar_team_not_found' });
    const teamId = event.data.resource_id, date = event.data.source_date;
    const [staff, memberships, events] = await Promise.all([
        admin.from('staff_members').select('id,name', { count: 'exact' }).eq('organization_id', org).eq('is_active', true).order('id').range(0, 199),
        admin.from('staff_assignments').select('id,staff_id', { count: 'exact' }).eq('organization_id', org).eq('team_id', teamId).eq('assignment_date', date).order('id').range(0, 199),
        admin.from('calendar_events').select('id,booking_id', { count: 'exact' }).eq('organization_id', org).eq('resource_id', teamId).eq('source_date', date).order('id').range(0, 199),
    ]);
    if ([staff, memberships, events].some(r => r.error || r.count === null || r.count !== (r.data ?? []).length))
        return json(503, { error: 'options_incomplete' });
    const largeProjects = await admin.from('large_projects').select('id', { count: 'exact' }).eq('organization_id', org).is('deleted_at', null).or(`start_date.cs.{${date}},event_date.cs.{${date}},end_date.cs.{${date}}`).order('id').range(0, 199);
    if (largeProjects.error || largeProjects.count === null || largeProjects.count !== (largeProjects.data ?? []).length)
        return json(503, { error: 'options_incomplete' });
    const largeIds = (largeProjects.data ?? []).map(row => row.id);
    const largeBookings = largeIds.length ? await admin.from('large_project_bookings').select('booking_id', { count: 'exact' }).eq('organization_id', org).in('large_project_id', largeIds).order('booking_id').range(0, 199) : { data: [], count: 0, error: null };
    if (largeBookings.error || largeBookings.count === null || largeBookings.count !== (largeBookings.data ?? []).length)
        return json(503, { error: 'options_incomplete' });
    const affectedBookingIds = [...new Set([...(events.data ?? []), ...(largeBookings.data ?? [])].map(row => row.booking_id).filter(Boolean))];
    const bookings = affectedBookingIds.length ? await admin.from('bookings').select('id,title,booking_number', { count: 'exact' }).eq('organization_id', org).in('id', affectedBookingIds).order('id').range(0, 499) : { data: [], count: 0, error: null };
    if (bookings.error || bookings.count !== affectedBookingIds.length || (bookings.data ?? []).length !== affectedBookingIds.length)
        return json(503, { error: 'options_incomplete' });
    return json(200, {
        schema: 'planning-mobile-staff-options.v1', canonicalIdentity: { actorUserId: actor, organizationId: org },
        calendarEventId: body.calendarEventId, teamId, date, writeEnabled: Deno.env.get('PLANNING_MOBILE_STAFF_WRITE') === 'true',
        staff: (staff.data ?? []).map(row => ({ staffId: row.id, name: row.name, membershipId: (memberships.data ?? []).find(m => m.staff_id === row.id)?.id ?? null })),
        affectedBookingIds, affectedBookings: (bookings.data ?? []).map(row => ({ id: row.id, title: row.title, bookingRef: row.booking_number })),
    });
}
if (import.meta.main)
    Deno.serve(handleRequest);
