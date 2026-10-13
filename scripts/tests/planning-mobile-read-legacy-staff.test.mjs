// Regression (incident 2026-10-13): legacy text staff ids (non-uuid) must never reach the
// uuid profiles.user_id filter; Postgres rejected the whole read as staff_read_failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const contractUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/planning-brain-read-contract.ts', import.meta.url), 'utf8'));
const hubUrl = dataUrl(await readFile(new URL('../../supabase/functions/_shared/hub-actor.ts', import.meta.url), 'utf8'));
const contract = await import(contractUrl);
const source = (await readFile(new URL('../../supabase/functions/planning-mobile-read/index.ts', import.meta.url), 'utf8'))
    .replace(/import \{ createClient \} from '[^']+';?/, 'const createClient = (...args) => globalThis.__legacyClient(...args);')
    .replace("'../_shared/planning-brain-read-contract.ts'", JSON.stringify(contractUrl))
    .replace("'../_shared/hub-actor.ts'", JSON.stringify(hubUrl))
    .replace("'../_shared/projectPhaseDates.ts'", JSON.stringify(dataUrl(await readFile(new URL('../../supabase/functions/_shared/projectPhaseDates.ts', import.meta.url), 'utf8'))));
const { handleRequest } = await import(dataUrl(source));
const org = '22222222-2222-4222-8222-222222222222', hub = '11111111-1111-4111-8111-111111111111';
const local = '55555555-5555-4555-8555-555555555555', uuidStaff = '44444444-4444-4444-8444-444444444444';
const legacyStaff = 'staff_1700000000000_legacy';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secret = 'test-only-signing-secret';
globalThis.Deno = { env: { get: key => ({ PLANNING_BRAIN_READ_SIGNING_SECRET: secret, SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[key] } };

async function run(staffIds, { staffError = false } = {}) {
    const profileFilters = [], orgFilters = {};
    globalThis.__legacyClient = () => ({
        rpc: async (fn) => fn === 'resolve_hub_actor_v1'
            ? { data: { status: 'ok', mode: 'linked', localUserId: local }, error: null }
            : { data: true, error: null },
        from(table) {
            let inValues = null, single = false;
            const assignments = staffIds.map((s, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`, organization_id: org, booking_id: null, staff_id: s, team_id: 'team-1', role: null, assignment_date: '2026-10-12' }));
            const data = {
                organizations: { id: org },
                user_roles: [{ role: 'projekt', organization_id: org }],
                projects: [], jobs: [], large_projects: [], calendar_events: [], booking_staff_assignments: assignments,
                staff_members: [{ id: legacyStaff, name: 'Äldre personal' }],
                profiles: [{ user_id: uuidStaff, full_name: 'Ny personal' }],
            };
            const counts = { projects: 0, jobs: 0, large_projects: 0, calendar_events: 0, booking_staff_assignments: assignments.length };
            const q = {
                select() { return q; }, eq(k, v) { if (k === 'organization_id') (orgFilters[table] ??= []).push(v); return q; }, is() { return q; }, or() { return q; }, not() { return q; }, gte() { return q; }, lte() { return q; }, order() { return q; }, range() { return q; },
                in(_k, v) { inValues = v; if (table === 'profiles') profileFilters.push(v); return q; },
                maybeSingle() { single = true; return q; },
                then(resolve) {
                    // Emulate Postgres: uuid column rejects non-uuid literals.
                    if (table === 'profiles' && inValues?.some(v => !UUID.test(v)))
                        return Promise.resolve({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } }).then(resolve);
                    if (table === 'staff_members' && staffError)
                        return Promise.resolve({ data: null, error: { code: '57014', message: 'statement timeout' } }).then(resolve);
                    const d = data[table];
                    return Promise.resolve({ data: single ? d : d, error: null, count: counts[table] ?? null }).then(resolve);
                },
            };
            return q;
        },
    });
    const raw = JSON.stringify({ schema: 'planning-mobile-read-request.v1', actorUserId: hub, organizationId: org, from: '2026-10-10', to: '2026-10-20' });
    const timestamp = String(Date.now()), nonce = 'test_nonce_legacy_123456';
    const signature = await contract.signPlanningBrainRequest(secret, timestamp, nonce, raw);
    const response = await handleRequest(new Request('https://test.invalid', { method: 'POST', headers: { 'x-planning-timestamp': timestamp, 'x-planning-nonce': nonce, 'x-planning-signature': signature }, body: raw }));
    return { response, body: await response.json(), profileFilters, orgFilters };
}

test('mixed legacy text + uuid staff ids read successfully with names from both sources', async () => {
    const r = await run([legacyStaff, uuidStaff]);
    assert.equal(r.response.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.schema, 'planning-mobile-read.v1');
    assert.deepEqual(r.body.canonicalIdentity, { organizationId: org, actorUserId: hub });
    assert.ok(r.profileFilters.every(list => list.every(v => UUID.test(v))));
    const names = r.body.teamAssignments.map(a => a.staffName).sort();
    assert.deepEqual(names, ['Ny personal', 'Äldre personal']);
});

test('only legacy staff ids skip the profiles lookup entirely', async () => {
    const r = await run([legacyStaff]);
    assert.equal(r.response.status, 200, JSON.stringify(r.body));
    assert.equal(r.profileFilters.length, 0);
});

test('staff name lookups stay scoped to the requested organization only', async () => {
    const r = await run([legacyStaff, uuidStaff]);
    assert.deepEqual(r.orgFilters.staff_members, [org]);
    assert.deepEqual(r.orgFilters.profiles, [org]);
});

test('a real staff lookup failure still fails closed (not hidden as unknown staff)', async () => {
    const r = await run([legacyStaff, uuidStaff], { staffError: true });
    assert.equal(r.response.status, 503);
    assert.equal(r.body.error, 'staff_read_failed');
    assert.equal(r.body.teamAssignments, undefined);
});
