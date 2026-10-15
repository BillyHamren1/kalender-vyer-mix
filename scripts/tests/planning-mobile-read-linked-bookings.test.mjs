// Regression (2026-10-13): projects without own phase dates must appear when their booking
// has calendar events / staff assignments in the window; no cross-org/deleted/out-of-window leaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataUrl = s => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(s)).toString('base64')}`;
const contractUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/planning-brain-read-contract.ts', import.meta.url), 'utf8'));
const hubUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/hub-actor.ts', import.meta.url), 'utf8'));
const contract = await import(contractUrl);
const source = (await readFile(new URL('../../supabase/functions/planning-mobile-read/index.ts', import.meta.url), 'utf8'))
  .replace(/import \{ createClient \} from '[^']+';?/, 'const createClient = (...a) => globalThis.__linkClient(...a);')
  .replace("'../_shared/planning-brain-read-contract.ts'", JSON.stringify(contractUrl))
  .replace("'../_shared/hub-actor.ts'", JSON.stringify(hubUrl))
  .replace("'../_shared/projectPhaseDates.ts'", JSON.stringify(dataUrl(await readFile(new URL('../../supabase/functions/_shared/projectPhaseDates.ts', import.meta.url), 'utf8'))));
const { handleRequest } = await import(dataUrl(source));
const ORG = '22222222-2222-4222-8222-222222222222', OTHER = '66666666-6666-4666-8666-666666666666', HUB = '11111111-1111-4111-8111-111111111111';
const B_EVENT = '1ad83629-562f-48f7-ab08-0228361ed922', B_ASSIGN = '294ab644-957b-41c9-b517-24ce7a01c71e';
const B_OUT = '77777777-7777-4777-8777-777777777777', B_OTHERORG = '88888888-8888-4888-8888-888888888888', B_DELETED = '99999999-9999-4999-8999-999999999999';
const secret = 'test-only-signing-secret';
globalThis.Deno = { env: { get: k => ({ PLANNING_BRAIN_READ_SIGNING_SECRET: secret, SUPABASE_URL: 'https://t.invalid', SUPABASE_SERVICE_ROLE_KEY: 'x' })[k] } };
const FROM = '2026-10-01', TO = '2026-10-31';
const db = {
  calendar_events: [
    { id: 'e1', organization_id: ORG, booking_id: B_EVENT, resource_id: 'team-1', event_type: 'rig', source_date: '2026-10-13', start_time: '2026-10-13T07:00:00Z', end_time: '2026-10-13T15:00:00Z', times_locked: false },
    { id: 'e2', organization_id: ORG, booking_id: B_OUT, resource_id: 'team-1', event_type: 'rig', source_date: '2026-12-01', start_time: '2026-12-01T07:00:00Z', end_time: '2026-12-01T15:00:00Z', times_locked: false },
    { id: 'e3', organization_id: OTHER, booking_id: B_OTHERORG, resource_id: 'team-1', event_type: 'rig', source_date: '2026-10-14', start_time: '2026-10-14T07:00:00Z', end_time: '2026-10-14T15:00:00Z', times_locked: false },
    { id: 'e4', organization_id: ORG, booking_id: B_DELETED, resource_id: 'team-1', event_type: 'rig', source_date: '2026-10-14', start_time: '2026-10-14T07:00:00Z', end_time: '2026-10-14T15:00:00Z', times_locked: false },
  ],
  booking_staff_assignments: [{ id: 'a1', organization_id: ORG, booking_id: B_ASSIGN, staff_id: 'staff_x', team_id: 'team-1', role: null, assignment_date: '2026-10-12' }],
  projects: [
    { id: 'a0000000-0000-4000-8000-000000000001', name: 'Event', organization_id: ORG, booking_id: B_EVENT, deleted_at: null, rigdaydate: null, eventdate: null, rigdowndate: null, status: 'planning' },
    { id: 'a0000000-0000-4000-8000-000000000002', name: 'Assign', organization_id: ORG, booking_id: B_ASSIGN, deleted_at: null, rigdaydate: null, eventdate: null, rigdowndate: null, status: 'planning' },
    { id: 'a0000000-0000-4000-8000-000000000003', name: 'Dated', organization_id: ORG, booking_id: null, deleted_at: null, rigdaydate: '2026-10-05', eventdate: '2026-10-06', rigdowndate: '2026-10-07', status: 'planning' },
    { id: 'a0000000-0000-4000-8000-000000000004', name: 'Out', organization_id: ORG, booking_id: B_OUT, deleted_at: null, rigdaydate: '2025-01-01', eventdate: null, rigdowndate: '2025-01-02', status: 'planning' },
    { id: 'a0000000-0000-4000-8000-000000000005', name: 'Other', organization_id: OTHER, booking_id: B_OTHERORG, deleted_at: null, rigdaydate: null, eventdate: null, rigdowndate: null, status: 'planning' },
    { id: 'a0000000-0000-4000-8000-000000000006', name: 'Deleted', organization_id: ORG, booking_id: B_DELETED, deleted_at: '2026-10-01T00:00:00Z', rigdaydate: null, eventdate: null, rigdowndate: null, status: 'planning' },
  ],
  jobs: [
    { id: 'b0000000-0000-4000-8000-000000000001', name: 'Litet', organization_id: ORG, booking_id: B_EVENT, status: 'planned', deleted_at: null },
    { id: 'b0000000-0000-4000-8000-000000000002', name: 'Annan org', organization_id: OTHER, booking_id: B_OTHERORG, status: 'planned', deleted_at: null },
  ],
  large_projects: [
    // Same id as medium project 0001: identity must be (projectKind, projectId).
    { id: 'a0000000-0000-4000-8000-000000000001', name: 'Stort', organization_id: ORG, status: 'completed', start_date: ['2026-10-02'], event_date: null, end_date: ['2026-10-04'], deleted_at: null },
    { id: 'c0000000-0000-4000-8000-000000000002', name: 'Raderat stort', organization_id: ORG, status: 'planning', start_date: null, event_date: null, end_date: null, deleted_at: '2026-10-01T00:00:00Z' },
  ],
  bookings: [
    { id: B_EVENT, organization_id: ORG, client: 'Perfect Event', booking_number: '2609-61', rigdaydate: '2026-10-13', eventdate: '2026-10-14', rigdowndate: '2026-10-15' },
    { id: B_OTHERORG, organization_id: OTHER, client: 'X', booking_number: '1', rigdaydate: '2026-10-01', eventdate: '2026-10-01', rigdowndate: '2026-10-01' },
  ],
  staff_members: [], profiles: [], organizations: { id: ORG }, user_roles: [{ role: 'projekt', organization_id: ORG, user_id: HUB }],
};
const inRange = (d, a, b) => d != null && d >= a && d <= b;
// Minimal PostgREST emulation of the exact filters used (eq/gte/lte/is/not/or).
function evalOr(row, expr) {
  const m = expr.match(/booking_id\.in\.\(([^)]*)\)/);
  if (m && m[1].split(',').includes(row.booking_id)) return true;
  const r = row, f = FROM, t = TO;
  return (r.rigdaydate && r.rigdowndate && r.rigdaydate <= t && r.rigdowndate >= f) || inRange(r.rigdaydate, f, t) || inRange(r.eventdate, f, t) || inRange(r.rigdowndate, f, t);
}
globalThis.__linkClient = () => ({
  rpc: async fn => fn === 'resolve_hub_actor_v1' ? { data: { status: 'ok', mode: 'direct', localUserId: HUB }, error: null } : { data: true, error: null },
  from(table) {
    const preds = []; let single = false;
    const q = {
      select() { return q; }, order() { return q; }, range() { return q; }, in() { return q; },
      eq(k, v) { preds.push(r => r[k] === v); return q; },
      gte(k, v) { preds.push(r => r[k] >= v); return q; }, lte(k, v) { preds.push(r => r[k] <= v); return q; },
      is(k, v) { preds.push(r => r[k] === v); return q; }, not(k) { preds.push(r => r[k] != null); return q; },
      or(expr) { preds.push(r => evalOr(r, expr)); return q; }, maybeSingle() { single = true; return q; },
      then(res) {
        const d = db[table];
        if (!Array.isArray(d)) return Promise.resolve({ data: d, error: null }).then(res);
        const rows = d.filter(r => preds.every(p => p(r)));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length }).then(res);
      },
    };
    return q;
  },
});
test('list mirrors Operations: every non-deleted same-org project, dates via shared rule, owner status tabs; no cross-org/deleted leaks', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T12:00:00Z') });
  const raw = JSON.stringify({ schema: 'planning-mobile-read-request.v1', actorUserId: HUB, organizationId: ORG, from: FROM, to: TO });
  const ts = String(Date.now()), nonce = 'test_nonce_linked_123456';
  const sig = await contract.signPlanningBrainRequest(secret, ts, nonce, raw);
  const resp = await handleRequest(new Request('https://t.invalid', { method: 'POST', headers: { 'x-planning-timestamp': ts, 'x-planning-nonce': nonce, 'x-planning-signature': sig }, body: raw }));
  const body = await resp.json();
  assert.equal(resp.status, 200, JSON.stringify(body));
  const ids = body.projects.map(p => p.projectId).sort();
  // 'Out' (dates outside window, no events) is listed like in Operations; other org + deleted are not.
  assert.deepEqual(ids, ['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004']);
  for (const p of body.projects) {
    const expected = { Event: 'in_progress', Assign: 'planning', Dated: 'completed', Out: 'completed' }[p.title];
    assert.equal(p.status, expected);
    assert.equal(p.lifecycle, expected === 'completed' ? 'completed' : 'active');
    assert.equal(p.statusTabs.includes('all_active'), expected !== 'completed');
    assert.ok(p.statusTabs.includes(expected));
    const entry = body.projectEntries.find(e => e.projectKind === 'medium' && e.projectId === p.projectId);
    assert.equal(entry.status, p.status);
    assert.equal(entry.lifecycle, p.lifecycle);
  }
  const out = body.projects.find(p => p.projectId.endsWith('04'));
  assert.equal(out.rigDate, '2025-01-01'); assert.equal(out.dateSources.rig, 'project');
  assert.ok(out.statusTabs.includes('closing') === false); // no event date -> not in 'Under slutförande'
  assert.deepEqual(body.canonicalIdentity, { organizationId: ORG, actorUserId: HUB });
  // All kinds, unique by kind+id, no cross-org / deleted rows.
  const keys = body.projectEntries.map(e => e.entryKey).sort();
  assert.deepEqual(keys, ['large:a0000000-0000-4000-8000-000000000001', 'medium:a0000000-0000-4000-8000-000000000001', 'medium:a0000000-0000-4000-8000-000000000002', 'medium:a0000000-0000-4000-8000-000000000003', 'medium:a0000000-0000-4000-8000-000000000004', 'small:b0000000-0000-4000-8000-000000000001']);
  assert.deepEqual(body.projectEntriesTotals, { small: 1, medium: 4, large: 1 });
  const small = body.projectEntries.find(e => e.projectKind === 'small');
  assert.equal(small.title, 'Perfect Event #2609-61'); assert.equal(small.status, 'in_progress');
  assert.deepEqual([small.rigDate, small.eventDate, small.derigDate], ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.equal(small.dateSources.event, 'booking'); assert.equal(small.detailSupported, false);
  const large = body.projectEntries.find(e => e.projectKind === 'large');
  assert.deepEqual([large.rigDate, large.eventDate, large.derigDate], ['2026-10-02', null, '2026-10-04']);
  assert.equal(large.lifecycle, 'completed'); assert.deepEqual(large.statusTabs, ['all', 'completed']); assert.equal(large.bookingRef, null);
  assert.ok(body.projectEntries.filter(e => e.projectKind === 'medium').every(e => e.detailSupported === true));
  // Legacy `projects` array keeps medium-only semantics.
  assert.equal(body.projects.length, 4);
});

test('operational status follows phase boundaries and explicit terminal states', async () => {
  const { projectOperationalStatus: status, largeProjectView } = await import(dataUrl(await readFile(new URL('../../supabase/functions/_shared/projectPhaseDates.ts', import.meta.url), 'utf8')));
  const today = '2026-10-15';
  assert.equal(status('planning', { rigDownDate: '2026-10-14' }, today), 'completed');
  assert.equal(status('planning', { rigDate: '2026-10-13', rigDownDate: today }, today), 'in_progress');
  assert.equal(status('planning', { rigDate: '2026-10-16' }, today), 'planning');
  assert.equal(status('cancelled', { rigDownDate: '2026-10-14' }, today), 'cancelled');
  assert.equal(status('completed', { rigDate: '2026-10-16' }, today), 'completed');
  assert.equal(status('planning', {}, today), 'planning');
  const view = largeProjectView({ status: 'planning', start_date: ['2026-10-01'], end_date: ['2026-10-14', '2026-10-16'] });
  assert.equal(view.dates.rigdowndate, '2026-10-16');
  assert.equal(status(view.status, { rigDate: view.dates.rigdaydate, rigDownDate: view.dates.rigdowndate }, today), 'in_progress');
});
