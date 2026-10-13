/**
 * planning-mobile-read.v1 — signed, actor-bound mobile projection with project/staff labels
 * for EventFlow Agent Core (BRAIN). No writes, no provider/model calls, no
 * service-role exposure to any client, no cross-tenant reads.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { PLANNING_BRAIN_ACTOR_ROLES, PLANNING_BRAIN_NONCE_TTL_SECONDS, buildPlanningBrainProjection, parsePlanningBrainReadRequest, verifyPlanningBrainSignature, } from '../_shared/planning-brain-read-contract.ts';
import { authorizeHubActor, logActorDenial } from '../_shared/hub-actor.ts';
import { resolveProjectPhaseDates, classifyProjectLifecycle, projectStatusTabs, smallProjectView, largeProjectView } from '../_shared/projectPhaseDates.ts';
const json = (status: number, body: unknown) => {
    // Safe outcome diagnostic: status + error code / schema only, never ids or payload.
    const b = body as { error?: unknown; schema?: unknown };
    console.log(`[planning-mobile-read] outcome ${JSON.stringify({ status, error: b?.error ?? null, schema: status === 200 ? b?.schema ?? null : null })}`);
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
};

type PhaseDates = { rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null };
const PHASES = ['rigdaydate', 'eventdate', 'rigdowndate'] as const;
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Booking dates single source: per field, project's own date wins, else linked same-org booking date, else null.
async function loadBookingDates(admin: any, org: string, rows: Array<PhaseDates & { booking_id?: string | null }>): Promise<Map<string, PhaseDates> | null> {
    const ids = [...new Set(rows.filter(r => r.booking_id && UUID_ID.test(r.booking_id) && PHASES.some(k => !r[k])).map(r => r.booking_id as string))];
    const map = new Map<string, PhaseDates>();
    if (!ids.length) return map;
    const res = await admin.from('bookings').select('id, rigdaydate, eventdate, rigdowndate').eq('organization_id', org).in('id', ids);
    if (res.error) return null;
    for (const b of res.data ?? []) map.set(b.id, b);
    return map;
}
// Same shared rule as the Operations web header/booking card/team panel.
function withBookingDates<T extends PhaseDates & { booking_id?: string | null }>(row: T, map: Map<string, PhaseDates>) {
    const r = resolveProjectPhaseDates(row, row.booking_id ? map.get(row.booking_id) : null);
    return { ...row, rigdaydate: r.rigdaydate, eventdate: r.eventdate, rigdowndate: r.rigdowndate, dateSources: r.sources };
}
// Operations project-list classification (UnifiedProjectList status tabs); internal projects have no event date there.
const todayUtc = () => new Date().toISOString().slice(0, 10);
function ownerClassification(row: { status?: string | null; is_internal?: boolean | null; eventdate?: string | null }) {
    return { lifecycle: classifyProjectLifecycle(row.status), statusTabs: projectStatusTabs(row.status, row.is_internal ? null : row.eventdate, todayUtc()) };
}

// Additive all-kind entries (small=jobs, medium=projects, large=large_projects), identity = (projectKind, projectId).
function entry(kind: 'small' | 'medium' | 'large', id: string, title: string | null, view: { status: string | null; dates: any; listEventDate: string | null }, bookingRef: string | null) {
    return { projectKind: kind, projectId: id, entryKey: `${kind}:${id}`, title, status: view.status, bookingRef,
        rigDate: view.dates.rigdaydate, eventDate: view.dates.eventdate, derigDate: view.dates.rigdowndate, dateSources: view.dates.sources,
        lifecycle: classifyProjectLifecycle(view.status), statusTabs: projectStatusTabs(view.status, view.listEventDate, todayUtc()),
        detailSupported: kind === 'medium' };
}
async function loadOtherKinds(admin: any, org: string, offset: number) {
    const [jobs, large] = await Promise.all([
        admin.from('jobs').select('id, name, status, booking_id', { count: 'exact' }).eq('organization_id', org).is('deleted_at', null).order('id').range(offset, offset + 199),
        admin.from('large_projects').select('id, name, status, start_date, event_date, end_date', { count: 'exact' }).eq('organization_id', org).is('deleted_at', null).order('id').range(offset, offset + 199),
    ]);
    if (jobs.error || large.error) return null;
    for (const r of [jobs, large]) if (!Number.isSafeInteger(r.count) || (r.data ?? []).length !== Math.min(200, Math.max((r.count ?? 0) - offset, 0))) return null;
    const ids = [...new Set((jobs.data ?? []).map((j: any) => j.booking_id).filter((id: any) => typeof id === 'string' && UUID_ID.test(id)))];
    const bmap = new Map<string, any>();
    if (ids.length) {
        const b = await admin.from('bookings').select('id, client, booking_number, rigdaydate, eventdate, rigdowndate').eq('organization_id', org).in('id', ids);
        if (b.error) return null;
        for (const row of b.data ?? []) bmap.set(row.id, row);
    }
    const small = (jobs.data ?? []).map((j: any) => { const b = j.booking_id ? bmap.get(j.booking_id) : null;
        const title = b?.client ? `${b.client}${b.booking_number ? ' #' + b.booking_number : ''}` : j.name;
        return entry('small', j.id, title ?? null, smallProjectView(j, b), b ? j.booking_id : null); });
    const largeEntries = (large.data ?? []).map((lp: any) => entry('large', lp.id, lp.name ?? null, largeProjectView(lp), null));
    return { small, large: largeEntries, totals: { small: jobs.count as number, large: large.count as number } };
}

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
        const matches = await admin.from('projects').select('id, name, booking_id, status, rigdaydate, eventdate, rigdowndate', { count: 'exact' })
            .eq('organization_id', org).eq('booking_id', bookingId).is('deleted_at', null).order('id').range(0, 199);
        if (matches.error || matches.count === null || matches.count !== (matches.data ?? []).length) return json(503, { error: 'project_lookup_incomplete' });
        const resolverDates = await loadBookingDates(admin, org, matches.data ?? []);
        if (!resolverDates) return json(503, { error: 'booking_dates_read_failed' });
        const [rj, rl, rb] = await Promise.all([
            admin.from('jobs').select('id, name, status, booking_id').eq('organization_id', org).eq('booking_id', bookingId).is('deleted_at', null).order('id').range(0, 199),
            admin.from('large_project_bookings').select('large_project_id').eq('organization_id', org).eq('booking_id', bookingId).range(0, 199),
            admin.from('bookings').select('client, booking_number, rigdaydate, eventdate, rigdowndate, large_project_id').eq('organization_id', org).eq('id', bookingId).maybeSingle(),
        ]);
        if (rj.error || rl.error || rb.error) return json(503, { error: 'project_lookup_incomplete' });
        const lpIds = [...new Set([...(rl.data ?? []).map((r: any) => r.large_project_id), rb.data?.large_project_id].filter((id: any) => typeof id === 'string' && UUID_ID.test(id)))];
        const rlp = lpIds.length ? await admin.from('large_projects').select('id, name, status, start_date, event_date, end_date').eq('organization_id', org).in('id', lpIds).is('deleted_at', null) : { data: [], error: null };
        if (rlp.error) return json(503, { error: 'project_lookup_incomplete' });
        const relatedProjects = [
            ...(matches.data ?? []).map((raw: any) => { const row = withBookingDates(raw, resolverDates); return entry('medium', row.id, row.name, { status: raw.status ?? null, dates: { rigdaydate: row.rigdaydate, eventdate: row.eventdate, rigdowndate: row.rigdowndate, sources: row.dateSources }, listEventDate: row.eventdate }, raw.booking_id); }),
            ...(rj.data ?? []).map((j: any) => { const b = rb.data; const title = b?.client ? `${b.client}${b.booking_number ? ' #' + b.booking_number : ''}` : j.name; return entry('small', j.id, title ?? null, smallProjectView(j, b), b ? bookingId : null); }),
            ...(rlp.data ?? []).map((lp: any) => entry('large', lp.id, lp.name ?? null, largeProjectView(lp), null)),
        ];
        return json(200, {schema: 'planning-mobile-booking-projects.v1', relatedProjects, canonicalIdentity: {actorUserId: actor, organizationId: org}, bookingId, projects: (matches.data ?? []).map(raw => { const row = withBookingDates(raw, resolverDates); return {projectId: row.id, title: row.name, rigDate: row.rigdaydate, eventDate: row.eventdate, derigDate: row.rigdowndate, dateSources: row.dateSources}; })});
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
        // Booking dates single source: when the project has no own phase date, read the linked
        // booking's canonical rigdaydate/eventdate/rigdowndate (same org). Present project dates win.
        let bookingDates: { rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null } | null = null;
        if (p.booking_id && (!p.rigdaydate || !p.eventdate || !p.rigdowndate)) {
            const bk = await admin.from('bookings').select('rigdaydate, eventdate, rigdowndate')
                .eq('organization_id', org).eq('id', p.booking_id).maybeSingle();
            if (bk.error) return json(503, { error: 'booking_dates_read_failed' });
            bookingDates = bk.data ?? null;
        }
        const resolved = resolveProjectPhaseDates(p, bookingDates);
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
            project: {projectKind:'medium',projectId:p.id,title:p.name,bookingRef:p.booking_id,status:p.status,planningStatus:p.planning_status,isInternal:p.is_internal,rigDate:resolved.rigdaydate,eventDate:resolved.eventdate,derigDate:resolved.rigdowndate,dateSources:resolved.sources,...ownerClassification({status:p.status,is_internal:p.is_internal,eventdate:resolved.eventdate})},
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
    // Project list mirrors Operations: every non-deleted project in the org (status tabs are
    // classified per row). Calendar events and staff assignments stay bounded to the requested window.
    const [projectsResult, eventsResult, assignmentsResult] = await Promise.all([
        admin.from('projects')
            .select('id, name, organization_id, booking_id, status, planning_status, is_internal, rigdaydate, eventdate, rigdowndate', { count: 'exact' })
            .eq('organization_id', org)
            .is('deleted_at', null)
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
    const listDates = await loadBookingDates(admin, org, projectsResult.data ?? []);
    if (!listDates) return json(503, { error: 'booking_dates_read_failed' });
    const listProjects = (projectsResult.data ?? []).map(row => withBookingDates(row, listDates));
    const ownerById = new Map(listProjects.map(row => [row.id, { dateSources: row.dateSources, ...ownerClassification(row) }]));
    const projection = buildPlanningBrainProjection({
        request: parsed.value,
        generatedAt: new Date().toISOString(),
        rows: {
            projects: listProjects,
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
    const others = await loadOtherKinds(admin, org, offset);
    if (!others) return json(503, { error: 'project_kinds_read_failed' });
    const mediumEntries = listProjects.map((row: any) => entry('medium', row.id, row.name ?? null, { status: row.status ?? null, dates: { rigdaydate: row.rigdaydate, eventdate: row.eventdate, rigdowndate: row.rigdowndate, sources: row.dateSources }, listEventDate: row.is_internal ? null : row.eventdate }, row.booking_id ?? null));
    const projectEntries = [...others.small, ...mediumEntries, ...others.large];
    const entryTotals = { small: others.totals.small, medium: totals.projects as number, large: others.totals.large };
    const hasMore = Object.values(totals).some(count => (count ?? 0) > offset + 200) || entryTotals.small > offset + 200 || entryTotals.large > offset + 200;
    return json(200, {
        ...projection,
        schema: 'planning-mobile-read.v1',
        canonicalIdentity: { organizationId: org, actorUserId: actor },
        projects: projection.projects.map(row => ({ ...row, title: titles.get(row.projectId) || null, ...(ownerById.get(row.projectId) ?? { dateSources: { rig: null, event: null, derig: null }, lifecycle: null, statusTabs: [] }) })),
        teamAssignments: projection.teamAssignments.map(row => ({ ...row, staffName: row.staffRef ? names.get(row.staffRef) ?? null : null })),
        projectEntries,
        projectEntriesTotals: entryTotals,
        page: { offset, limit: 200, hasMore, nextOffset: hasMore ? offset + 200 : null, totals },
    });
}
if (import.meta.main)
    Deno.serve(handleRequest);
