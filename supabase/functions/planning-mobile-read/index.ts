/**
 * planning-mobile-read.v1 — signed, actor-bound mobile projection with project/staff labels
 * for EventFlow Agent Core (BRAIN). No writes, no provider/model calls, no
 * service-role exposure to any client, no cross-tenant reads.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { PLANNING_BRAIN_ACTOR_ROLES, PLANNING_BRAIN_NONCE_TTL_SECONDS, buildPlanningBrainProjection, parsePlanningBrainReadRequest, verifyPlanningBrainSignature, } from '../_shared/planning-brain-read-contract.ts';
import { authorizeHubActor, logActorDenial } from '../_shared/hub-actor.ts';
const json = (status: number, body: unknown) => {
    // Safe outcome diagnostic: status + error code / schema only, never ids or payload.
    const b = body as { error?: unknown; schema?: unknown };
    console.log(`[planning-mobile-read] outcome ${JSON.stringify({ status, error: b?.error ?? null, schema: status === 200 ? b?.schema ?? null : null })}`);
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
};
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
    const body = (() => { try {
        return JSON.parse(rawBody || 'null');
    }
    catch {
        return null;
    } })();
    if (body?.schema !== 'planning-mobile-read-request.v1')
        return json(400, { error: 'unsupported_schema' });
    const offset = body.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
        return json(400, { error: 'invalid_offset' });
    const { offset: ignoredOffset, projectId, bookingId, ...baseBody } = body;
    if (projectId !== undefined && (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)))
        return json(400, { error: 'invalid_project_id' });
    if (bookingId !== undefined && (typeof bookingId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId))) return json(400, { error: 'invalid_booking_id' });
    const parsed = parsePlanningBrainReadRequest({ ...baseBody, schema: 'planning-brain-read-request.v2' });
    if (!parsed.ok)
        return json(400, { error: parsed.error });
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey)
        return json(503, { error: 'service_not_configured' });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const org = parsed.value.organizationId;
    const { from, to } = parsed.value;
    // Replay safety: server-owned one-time nonce consumption (security primitive,
    // the ONLY mutating call in this route — never business data).
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
    // Request principal = canonical HUB subject; owner resolves trusted local principal for roles.
    const actor = parsed.value.actorUserId;
    const actorAuth = await authorizeHubActor(admin, { hubSubject: actor, organizationId: org, roles: PLANNING_BRAIN_ACTOR_ROLES });
    if (!actorAuth.ok) { logActorDenial('planning-mobile-read', actorAuth.reason, org); return json(actorAuth.status, { error: actorAuth.error }); }

    if (bookingId) {
        const matches = await admin.from('projects').select('id, name', { count: 'exact' })
            .eq('organization_id', org).eq('booking_id', bookingId).is('deleted_at', null).order('id').range(0, 199);
        if (matches.error || matches.count === null || matches.count !== (matches.data ?? []).length) return json(503, { error: 'project_lookup_incomplete' });
        return json(200, {schema: 'planning-mobile-booking-projects.v1', canonicalIdentity: {actorUserId: actor, organizationId: org}, bookingId, projects: (matches.data ?? []).map(row => ({projectId: row.id, title: row.name}))});
    }
    if (projectId) {
        const project = await admin.from('projects')
            .select('id, name, booking_id, status, planning_status, is_internal, rigdaydate, eventdate, rigdowndate, contact_name, contact_phone, contact_email, deliveryaddress, delivery_city, delivery_postal_code, internalnotes')
            .eq('organization_id', org).eq('id', projectId).is('deleted_at', null).maybeSingle();
        if (project.error)
            return json(503, { error: 'project_read_failed' });
        if (!project.data)
            return json(404, { error: 'project_not_found' });
        // project_comments was removed (one bulletin board = projects.internalnotes, returned as notes).
        const files = await admin.from('project_files').select('id, file_name, file_type, url', { count: 'exact' }).eq('organization_id', org).eq('project_id', projectId).order('id').range(0, 199);
        if (files.error)
            return json(503, { error: 'project_detail_failed' });
        // A bounded detail must never silently hide attachments.
        if (files.count === null || files.count !== (files.data ?? []).length)
            return json(503, { error: 'project_detail_too_large' });
        const p = project.data;
        const targets = [`project_id.eq.${p.id}`];
        if (p.booking_id) targets.push(`booking_id.eq.${p.booking_id}`);
        const costs = await admin.from('project_staff_time_cost_lines')
            .select('id, staff_name, date, minutes, cost, submission_status', { count: 'exact' })
            .eq('organization_id', org).or(targets.join(','))
            .in('submission_status', ['submitted', 'edited', 'ai_flagged', 'needs_user_attention', 'needs_control', 'approved', 'payroll_approved'])
            .order('date').order('id').range(0, 199);
        const costsComplete = !costs.error && costs.count !== null && costs.count === (costs.data ?? []).length;

        return json(200, {
            schema: 'planning-mobile-detail.v1',
            canonicalIdentity: { actorUserId: actor, organizationId: org },
            projectId: p.id, title: p.name, bookingRef: p.booking_id,
            project: {projectId:p.id,title:p.name,bookingRef:p.booking_id,status:p.status,planningStatus:p.planning_status,isInternal:p.is_internal,rigDate:p.rigdaydate,eventDate:p.eventdate,derigDate:p.rigdowndate},
            contactName: p.contact_name, contactPhone: p.contact_phone, contactEmail: p.contact_email,
            address: p.deliveryaddress, city: p.delivery_city, postalCode: p.delivery_postal_code,
            notes: p.internalnotes, generatedAt: new Date().toISOString(),
            timeCosts: {
                state: costsComplete ? 'available' : 'unavailable',
                source: 'project_staff_time_cost_lines',
                currency: null,
                rows: costsComplete ? (costs.data ?? []).map(row => ({ id: row.id, staffName: row.staff_name, date: row.date, minutes: row.minutes, cost: row.cost, submissionStatus: row.submission_status })) : [],
            },
            files: (files.data ?? []).map(row => ({ id: row.id, name: row.file_name, type: row.file_type, url: row.url })),
            comments: [],
        });
    }
    // Projects are also in the window when their booking has calendar events or staff
    // assignments in it (projects often lack own phase dates). Same org, bounded, fail closed.
    const LINK_LIMIT = 2000;
    const [linkEvents, linkAssignments] = await Promise.all([
        admin.from('calendar_events').select('booking_id', { count: 'exact' }).eq('organization_id', org)
            .gte('source_date', from).lte('source_date', to).not('booking_id', 'is', null).order('id').range(0, LINK_LIMIT - 1),
        admin.from('booking_staff_assignments').select('booking_id', { count: 'exact' }).eq('organization_id', org)
            .gte('assignment_date', from).lte('assignment_date', to).not('booking_id', 'is', null).order('id').range(0, LINK_LIMIT - 1),
    ]);
    if (linkEvents.error || linkAssignments.error) return json(503, { error: 'planning_read_failed' });
    if ((linkEvents.count ?? 0) > LINK_LIMIT || (linkAssignments.count ?? 0) > LINK_LIMIT) return json(503, { error: 'window_too_large' });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const linkedBookingIds = [...new Set([...(linkEvents.data ?? []), ...(linkAssignments.data ?? [])]
        .map(row => row.booking_id).filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)))].sort();
    const dateOverlap = `and(rigdaydate.lte.${to},rigdowndate.gte.${from}),and(rigdaydate.gte.${from},rigdaydate.lte.${to}),and(eventdate.gte.${from},eventdate.lte.${to}),and(rigdowndate.gte.${from},rigdowndate.lte.${to})`;
    const projectFilter = linkedBookingIds.length ? `${dateOverlap},booking_id.in.(${linkedBookingIds.join(',')})` : dateOverlap;
    const [projectsResult, eventsResult, assignmentsResult] = await Promise.all([
        admin.from('projects')
            .select('id, name, organization_id, booking_id, status, planning_status, is_internal, rigdaydate, eventdate, rigdowndate', { count: 'exact' })
            .eq('organization_id', org)
            .is('deleted_at', null)
            .or(projectFilter)
            .order('id').range(offset, offset + 199),
        admin.from('calendar_events')
            .select('id, organization_id, booking_id, resource_id, event_type, source_date, start_time, end_time, times_locked', { count: 'exact' })
            .eq('organization_id', org)
            .gte('source_date', from)
            .lte('source_date', to).order('id').range(offset, offset + 199),
        admin.from('booking_staff_assignments')
            .select('id, organization_id, booking_id, staff_id, team_id, role, assignment_date', { count: 'exact' })
            .eq('organization_id', org)
            .gte('assignment_date', from)
            .lte('assignment_date', to).order('id').range(offset, offset + 199),
    ]);
    if (projectsResult.error || eventsResult.error || assignmentsResult.error) {
        return json(503, { error: 'planning_read_failed' });
    }
    const projection = buildPlanningBrainProjection({
        request: parsed.value,
        generatedAt: new Date().toISOString(),
        rows: {
            projects: projectsResult.data ?? [],
            calendarEvents: eventsResult.data ?? [],
            assignments: assignmentsResult.data ?? [],
        },
    });
    const staffIds = [...new Set((assignmentsResult.data ?? []).map(row => row.staff_id).filter(Boolean))];
    // profiles.user_id is uuid; legacy staff ids (e.g. 'staff_…') are text and must not reach that filter.
    const profileIds = staffIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    const [staff, profiles] = staffIds.length ? await Promise.all([
        admin.from('staff_members').select('id, name').eq('organization_id', org).in('id', staffIds),
        profileIds.length
            ? admin.from('profiles').select('user_id, full_name').eq('organization_id', org).in('user_id', profileIds)
            : Promise.resolve({ data: [], error: null }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (staff.error || profiles.error)
        return json(503, { error: 'staff_read_failed' });
    const names = new Map<string, string>();
    for (const row of profiles.data ?? [])
        if (row.full_name)
            names.set(row.user_id, row.full_name);
    for (const row of staff.data ?? [])
        if (row.name)
            names.set(row.id, row.name);
    const titles = new Map((projectsResult.data ?? []).map(row => [row.id, row.name]));
    const totals = { projects: projectsResult.count, planningDays: eventsResult.count, teamAssignments: assignmentsResult.count };
    if (Object.values(totals).some(count => !Number.isSafeInteger(count) || (count ?? -1) < 0))
        return json(503, { error: 'count_unavailable' });
    for (const result of [projectsResult, eventsResult, assignmentsResult]) {
        const expected = Math.min(200, Math.max((result.count ?? 0) - offset, 0));
        if ((result.data ?? []).length !== expected)
            return json(503, { error: 'incomplete_page' });
    }
    const hasMore = Object.values(totals).some(count => (count ?? 0) > offset + 200);
    return json(200, {
        ...projection,
        schema: 'planning-mobile-read.v1',
        canonicalIdentity: { organizationId: org, actorUserId: actor },
        projects: projection.projects.map(row => ({ ...row, title: titles.get(row.projectId) || null })),
        teamAssignments: projection.teamAssignments.map(row => ({ ...row, staffName: row.staffRef ? names.get(row.staffRef) ?? null : null })),
        page: { offset, limit: 200, hasMore, nextOffset: hasMore ? offset + 200 : null, totals },
    });
}
if (import.meta.main)
    Deno.serve(handleRequest);
