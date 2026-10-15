import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const contractUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/planning-brain-read-contract.ts', import.meta.url), 'utf8'));
const contract = await import(contractUrl);
const hubActorUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/hub-actor.ts', import.meta.url), 'utf8'));
// These suites exercise legacy list/detail routes; unexpected workspace routing must fail.
const workspaceUrl = dataUrl(`export async function loadOperationsProjectWorkspace() { throw new Error('unexpected_workspace_route_in_legacy_suite'); }`);
const workspaceOptionsUrl = dataUrl(`export async function loadWorkspaceSupplierTransportOptions() { throw new Error('unexpected_workspace_options_route_in_legacy_suite'); }`);
const workspacePresentationUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/operations-project-workspace-presentation.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../../supabase/functions/planning-mobile-read/index.ts', import.meta.url), 'utf8'))
    .replace("import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'", 'const createClient = (...args) => globalThis.__mobileReadClient(...args)')
    .replace("'../_shared/planning-brain-read-contract.ts'", JSON.stringify(contractUrl))
    .replace("'../_shared/hub-actor.ts'", JSON.stringify(hubActorUrl))
    .replace("'../_shared/operations-project-workspace.ts'", JSON.stringify(workspaceUrl))
  .replace("'../_shared/operations-project-workspace-suppliers.ts'", JSON.stringify(workspaceOptionsUrl))
  .replace("'../_shared/operations-project-workspace-presentation.ts'", JSON.stringify(workspacePresentationUrl))
  .replace("'../_shared/projectPhaseDates.ts'", JSON.stringify(dataUrl(await readFile(new URL('../../supabase/functions/_shared/projectPhaseDates.ts', import.meta.url), 'utf8'))));
const { handleRequest, readMobilePage } = await import(dataUrl(source));
const org = '22222222-2222-4222-8222-222222222222', actor = '11111111-1111-4111-8111-111111111111';
const staffId = '44444444-4444-4444-8444-444444444444', projectId = '33333333-3333-4333-8333-333333333333';
const secret = 'test-only-signing-secret';
globalThis.Deno = { env: { get: key => ({ PLANNING_BRAIN_READ_SIGNING_SECRET: secret, SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[key] } };
async function run({ missingStates = false, exhausted = false, body = {}, authorized = true, replay = false, count = 1, cap = 200, resolver = { status: 'ok', mode: 'direct', localUserId: actor }, roleOrg = org } = {}) {
    const calls = [];
    globalThis.__mobileReadClient = () => ({ rpc: async (name, args) => { calls.push({ rpc: name, args }); return name === 'resolve_hub_actor_v1' ? { data: resolver, error: null } : { data: !replay, error: null }; }, from(table) {
            let single = false, head = false;
            const filters = [], row = { id: projectId, name: 'Etablering', organization_id: org, status: 'active', rigdaydate: '2026-10-01', rigdowndate: '2026-10-31' };
            const rows = { operations_project_states: missingStates ? [] : [{ project_id: projectId, status: "in_progress", lifecycle: "active", status_tabs: ["all", "all_active", "in_progress"] }], project_staff_time_cost_lines: [{id:projectId,staff_name:'Testpersonal',date:'2026-10-12',minutes:60,cost:200,submission_status:'submitted'}], project_files: [{ id: projectId, file_name: 'PM.pdf', file_type: 'application/pdf', url: 'https://files.invalid/pm.pdf' }], project_comments: [{ id: projectId, author_name: 'Test', content: 'Rigg 08:00', created_at: '2026-10-12T07:00:00Z' }], organizations: { id: org }, profiles: { organization_id: authorized ? org : 'wrong' }, user_roles: authorized ? [{ role: 'projekt', organization_id: roleOrg }] : [], projects: Array.from({ length: Math.min(cap, Math.max(count - (body.offset ?? 0), 0)) }, () => row), jobs: [], large_projects: [], calendar_events: [], booking_staff_assignments: (body.offset ?? 0) > 0 ? [] : [{ id: projectId, organization_id: org, staff_id: staffId, assignment_date: '2026-10-12' }], staff_members: [{ id: staffId, name: 'Testpersonal' }] };
            const query = { select(columns, options) { head = options?.head === true; calls.push({ table, columns, filters }); return this; }, eq(k, v) { filters.push([k, v]); return this; }, in() { return this; }, is() { return this; }, not() { return this; }, or(value) { calls.push({ overlap: value }); return this; }, gte() { return this; }, lte() { return this; }, order() { return this; }, range(a, b) { calls.push({ range: [a, b] }); return this; }, maybeSingle() { single = true; return this; }, then(resolve) { const totals = { calendar_events: 59, booking_staff_assignments: 102, jobs: 0, large_projects: 0 }; if (exhausted && table in totals && (body.offset ?? 0) >= totals[table]) return Promise.resolve(head ? { data: null, error: null, count: totals[table], status: 200 } : { data: null, error: { code: 'PGRST103' }, count: null, status: 416 }).then(resolve); return Promise.resolve({ data: table === 'projects' && single ? row : table === 'profiles' && filters.some(([k]) => k === 'organization_id') ? [] : rows[table], error: null, count: table === 'projects' ? count : (table === 'calendar_events' || table === 'jobs' || table === 'large_projects') ? 0 : table === 'booking_staff_assignments' ? ((body.offset ?? 0) === 0 ? 1 : (rows[table] = [], 0)) : count }).then(resolve); } };
            return query;
        } });
    const raw = JSON.stringify({ schema: 'planning-mobile-read-request.v1', actorUserId: actor, organizationId: org, from: '2026-10-10', to: '2026-10-20', ...body });
    const timestamp = String(Date.now()), nonce = 'test_nonce_1234567890';
    const signature = await contract.signPlanningBrainRequest(secret, timestamp, nonce, raw);
    const response = await handleRequest(new Request('https://test.invalid', { method: 'POST', headers: { 'x-planning-timestamp': timestamp, 'x-planning-nonce': nonce, 'x-planning-signature': signature }, body: raw }));
    return { response, body: await response.json(), calls };
}
test('returns named projects and staff from authorized tenant-scoped owner rows', async () => {
    const r = await run();
    assert.equal(r.response.status, 200);
    assert.equal(r.body.projects[0].title, 'Etablering');
    assert.equal(r.body.teamAssignments[0].staffName, 'Testpersonal');
    for (const c of r.calls.filter(c => ['projects', 'calendar_events', 'booking_staff_assignments', 'staff_members'].includes(c.table)))
        assert.ok(c.filters.some(([k, v]) => k === 'organization_id' && v === org));
    // Project list mirrors Operations: no date-window filter on projects.
  assert.ok(!r.calls.some(c => c.overlap));
});
test('rejects wrong tenant actor before project/staff reads', async () => { const r = await run({ authorized: false }); assert.equal(r.response.status, 403); assert.ok(!r.calls.some(c => c.table === 'projects')); });
test('rejects replay before any table access', async () => { const r = await run({ replay: true }); assert.equal(r.response.status, 401); assert.ok(!r.calls.some(c => c.table || c.rpc === 'resolve_hub_actor_v1')); });
test('returns pagination instead of claiming a truncated window is complete', async () => { const r = await run({ count: 420, body: { offset: 200 } }); assert.equal(r.body.page.hasMore, true); assert.equal(r.body.page.nextOffset, 400); assert.ok(r.calls.some(c => c.range?.[0] === 200 && c.range?.[1] === 399)); });
test('rejects unsupported body and excessive date window', async () => { assert.equal((await run({ body: { extra: 'claim' } })).response.status, 400); assert.equal((await run({ body: { to: '2026-12-31' } })).response.status, 400); assert.equal((await run({ body: { offset: -1 } })).response.status, 400); });
test('fails explicitly when service cap returns fewer rows than exact count', async () => { const r = await run({ count: 201, cap: 100 }); assert.equal(r.response.status, 503); assert.equal(r.body.error, 'incomplete_page'); });
test('detail reads project, attachments and comments only within actor organization', async () => {
    const r = await run({ body: { projectId } });
    assert.equal(r.response.status, 200);
    assert.equal(r.body.schema, 'planning-mobile-detail.v1');
    assert.equal(r.body.files[0].name, 'PM.pdf');
    assert.deepEqual(r.body.comments, []);
    assert.ok(!r.calls.some(c => c.table === 'project_comments'), 'removed table must never be queried');
    for (const c of r.calls.filter(c => c.table === 'project_files')) {
        assert.ok(c.filters.some(([key, value]) => key === 'organization_id' && value === org));
        assert.ok(c.filters.some(([key, value]) => key === 'project_id' && value === projectId));
    }
});
test('detail rejects actor before project and child reads', async () => { const r = await run({ authorized: false, body: { projectId } }); assert.equal(r.response.status, 403); assert.ok(!r.calls.some(c => c.table === 'project_files')); });

test('detail time cost rows retain submission status and canonical project source',async()=>{
 const r=await run({body:{projectId}});assert.equal(r.body.timeCosts.source,'project_staff_time_cost_lines');assert.equal(r.body.timeCosts.state,'available');assert.equal(r.body.timeCosts.rows[0].submissionStatus,'submitted');
 const read=r.calls.find(c=>c.table==='project_staff_time_cost_lines');assert.ok(read.filters.some(([key,value])=>key==='organization_id'&&value===org));
});
test('booking resolver reads canonical project links without assuming IDs match',async()=>{
 const bookingId='55555555-5555-4555-8555-555555555555'; const r=await run({body:{bookingId}});assert.equal(r.response.status,200);assert.equal(r.body.schema,'planning-mobile-booking-projects.v1');assert.equal(r.body.projects[0].projectId,projectId);assert.notEqual(r.body.projects[0].projectId,bookingId);
 const c=r.calls.find(c=>c.table==='projects');assert.ok(c.filters.some(([key,value])=>key==='booking_id'&&value===bookingId));assert.ok(c.filters.some(([key,value])=>key==='organization_id'&&value===org));
});

const hubSubject = '66666666-6666-4666-8666-666666666666', adoptedLocal = '77777777-7777-4777-8777-777777777777';
test('adopted HUB identity: roles read for resolved local principal, response echoes HUB subject only', async () => {
 const r = await run({ resolver: { status: 'ok', mode: 'linked', localUserId: adoptedLocal } });
 assert.equal(r.response.status, 200);
 assert.deepEqual(r.body.canonicalIdentity, { organizationId: org, actorUserId: actor });
 assert.ok(!JSON.stringify(r.body).includes(adoptedLocal));
 const roles = r.calls.find(c => c.table === 'user_roles'); assert.ok(roles.filters.some(([k, v]) => k === 'user_id' && v === adoptedLocal)); assert.ok(roles.filters.some(([k, v]) => k === 'organization_id' && v === org));
 assert.equal(r.calls.find(c => c.rpc === 'resolve_hub_actor_v1').args._hub_user_id, actor);
 assert.ok(!r.calls.some(c => c.table === 'profiles' && c.filters.some(([k]) => k === 'user_id' && false)));
});
test('profile pointing at another org does not block an authorized member', async () => { const r = await run(); assert.equal(r.response.status, 200); assert.ok(!r.calls.some(c => c.table === 'profiles' && c.filters.some(([k, v]) => k === 'user_id'))); });
for (const status of ['actor_unmapped', 'actor_ambiguous']) test(`${status} mapping fails closed before reads`, async () => { const r = await run({ resolver: { status } }); assert.equal(r.response.status, 403); assert.equal(r.body.error, 'actor_not_authorized'); assert.ok(!r.calls.some(c => c.table === 'projects' || c.table === 'user_roles')); });
test('role only in another org is denied', async () => { const r = await run({ roleOrg: '99999999-9999-4999-8999-999999999999' }); assert.equal(r.response.status, 403); assert.ok(!r.calls.some(c => c.table === 'projects')); });
test('malformed resolver (direct with different id) fails closed', async () => { const r = await run({ resolver: { status: 'ok', mode: 'direct', localUserId: adoptedLocal } }); assert.equal(r.response.status, 503); assert.ok(!r.calls.some(c => c.table === 'projects')); });
void hubSubject;

// Production regression: projects still have a page while four sibling lists are exhausted.
test('310 projects / 59 events / 102 assignments: second page survives PostgREST 416', async () => {
 const r = await run({ exhausted: true, count: 310, body: { offset: 200 } });
 assert.equal(r.response.status, 200);
 assert.equal(r.body.projects.length, 110);
 assert.deepEqual(r.body.planningDays, []);
 assert.deepEqual(r.body.teamAssignments, []);
 assert.deepEqual(r.body.page.totals, { projects: 310, planningDays: 59, teamAssignments: 102 });
 assert.equal(r.body.page.hasMore, false);
 assert.equal(r.body.page.nextOffset, null);
 for (const c of r.calls.filter(c => ['projects', 'calendar_events', 'booking_staff_assignments', 'jobs', 'large_projects'].includes(c.table)))
   assert.ok(c.filters.some(([k, v]) => k === 'organization_id' && v === org));
});

const rangeError = { status: 416, error: { code: 'PGRST103' }, data: null, count: null };
function factory(page, total, calls) {
 return head => { calls.push(head); return head ? Promise.resolve(total) : { order() { return this; }, range() { return Promise.resolve(page); } }; };
}
test('recovery does not swallow database/auth errors or unproven exhaustion', async () => {
 for (const page of [{ ...rangeError, status: 403 }, { ...rangeError, error: { code: '42501' } }]) {
   const calls = []; assert.equal(await readMobilePage(factory(page, {count: 0}, calls), 200), page); assert.deepEqual(calls, [false]);
 }
 for (const total of [{count:null}, {count:-1}, {count:201}, {count:59,error:{code:'42501'}}]) {
   assert.equal(await readMobilePage(factory(rangeError, total, []), 200), rangeError);
 }
 const calls = []; assert.equal(await readMobilePage(factory(rangeError, {count:0}, calls), 0), rangeError); assert.deepEqual(calls,[false]);
});
test('exact boundary and empty collections retain independently verified totals', async () => {
 for (const count of [0,59,102,200]) {
   const result = await readMobilePage(factory(rangeError,{count,error:null},[]),200);
   assert.equal(result.error,null); assert.equal(result.count,count); assert.deepEqual(result.data,[]);
 }
});

test('missing canonical state fails closed instead of inventing an active/planning status', async () => {
  for (const body of [{}, { projectId }]) {
    const r = await run({ missingStates: true, body });
    assert.equal(r.response.status, 503);
    assert.equal(r.body.error, 'project_states_read_failed');
  }
});
test('mobile forwards Operations status unchanged in list and detail', async () => {
  for (const body of [{}, { projectId }]) {
    const r = await run({ body });
    const p = body.projectId ? r.body.project : r.body.projectEntries[0];
    assert.equal(p.status, 'in_progress');
    assert.equal(p.lifecycle, 'active');
    assert.deepEqual(p.statusTabs, ['all', 'all_active', 'in_progress']);
    assert.ok(r.calls.find(c => c.table === 'operations_project_states').filters.some(([key,value]) => key === 'organization_id' && value === org));
  }
});
