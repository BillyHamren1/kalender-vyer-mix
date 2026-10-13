// Messages receiver: canonical HUB subject -> protected resolver -> per-org roles -> unique active staff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataUrl = s => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(s)).toString('base64')}`;
const read = p => readFile(new URL(`../../supabase/functions/_shared/${p}`, import.meta.url), 'utf8');
const contractUrl = dataUrl(await read('planning-brain-read-contract.ts'));
const hubUrl = dataUrl(await read('hub-actor.ts'));
const contract = await import(contractUrl);
const mod = await import(dataUrl((await read('internal-messages.ts'))
  .replace("'./planning-brain-read-contract.ts'", JSON.stringify(contractUrl))
  .replace("'./hub-actor.ts'", JSON.stringify(hubUrl))));

const SECRET = 'test-only-internal-messages-secret-0123456789';
const ORG = '22222222-2222-4222-8222-222222222222', OTHER = '66666666-6666-4666-8666-666666666666';
const HUB = '11111111-1111-4111-8111-111111111111', LOCAL = '55555555-5555-4555-8555-555555555555';
const STAFF = 'staff_1700000000000_abc';

function db({ resolver = { status: 'ok', mode: 'linked', localUserId: LOCAL }, roles = { [LOCAL]: [{ role: 'forsaljning', organization_id: ORG }] }, staff = { [LOCAL]: [{ id: STAFF, is_active: true }] } } = {}) {
  const seen = { profiles: 0, rolesUser: [], staffUser: [], metadata: 0 };
  return { seen, client: {
    rpc: async (fn, args) => fn === 'consume_planning_brain_read_nonce' ? { data: true, error: null }
      : fn === 'resolve_hub_actor_v1' ? { data: typeof resolver === 'function' ? resolver(args) : resolver, error: null } : { data: null, error: { message: 'unexpected' } },
    from(table) {
      if (table === 'profiles') seen.profiles++;
      const f = {};
      const q = { select() { return q; }, eq(k, v) { f[k] = v; return q; }, in() { return q; }, limit() { return q; }, maybeSingle() { return q; },
        then(res) {
          if (table === 'user_roles') { seen.rolesUser.push(f.user_id); return Promise.resolve({ data: (roles[f.user_id] ?? []).filter(r => r.organization_id === f.organization_id), error: null }).then(res); }
          if (table === 'staff_members') { seen.staffUser.push(f.user_id); return Promise.resolve({ data: f.organization_id === ORG ? (staff[f.user_id] ?? []) : [], error: null }).then(res); }
          return Promise.resolve({ data: null, error: { message: 'unexpected table ' + table } }).then(res);
        } };
      return q;
    } } };
}
async function call(d, { actor = HUB, org = ORG, action = 'get_contacts', data, sign = true } = {}) {
  const body = { schema: mod.MESSAGE_SCHEMA, actorUserId: actor, organizationId: org, action, ...(data ? { data } : {}) };
  const rawBody = JSON.stringify(body);
  const ts = String(Date.now()), nonce = 'nonce_messages_test_123456';
  const signature = sign ? await contract.signPlanningBrainRequest(SECRET, ts, nonce, mod.MESSAGE_SCHEMA + '\n' + rawBody) : 'bad';
  const headers = new Headers({ 'x-internal-messages-timestamp': ts, 'x-internal-messages-nonce': nonce, 'x-internal-messages-signature': signature });
  return mod.authorizeInternalMessages({ body, rawBody, headers, method: 'POST', secret: SECRET, supabase: d.client });
}

test('linked HUB subject resolves to local user + unique staff; local ids used internally', async () => {
  const d = db(); const r = await call(d);
  assert.deepEqual(r, { staffId: STAFF, organizationId: ORG, userId: LOCAL });
  assert.deepEqual(d.seen.rolesUser, [LOCAL]); assert.deepEqual(d.seen.staffUser, [LOCAL]);
  assert.equal(d.seen.profiles, 0, 'last-used profile org must not be consulted');
});
test('direct HUB subject (own auth user) works', async () => {
  const d = db({ resolver: { status: 'ok', mode: 'direct', localUserId: HUB }, roles: { [HUB]: [{ role: 'lager', organization_id: ORG }] }, staff: { [HUB]: [] } });
  assert.deepEqual(await call(d), { staffId: HUB, organizationId: ORG, userId: HUB });
});
test('unmapped subject (e.g. only user_metadata spoof) denied before any role lookup', async () => {
  const d = db({ resolver: { status: 'actor_unmapped' } });
  assert.deepEqual(await call(d), { status: 403, error: 'actor_not_authorized' }); assert.equal(d.seen.rolesUser.length, 0);
});
test('ambiguous mapping denied', async () => assert.deepEqual(await call(db({ resolver: { status: 'actor_ambiguous' } })), { status: 403, error: 'actor_not_authorized' }));
test('direct mode claiming a different local id is malformed -> 503', async () => assert.equal((await call(db({ resolver: { status: 'ok', mode: 'direct', localUserId: LOCAL } }))).status, 503));
test('wrong org: member elsewhere only -> denied', async () => assert.deepEqual(await call(db(), { org: OTHER }), { status: 403, error: 'actor_not_authorized' }));
test('non-member (no role in org) denied', async () => assert.deepEqual(await call(db({ roles: {} })), { status: 403, error: 'actor_not_authorized' }));
test('inactive staff denied', async () => assert.equal((await call(db({ staff: { [LOCAL]: [{ id: STAFF, is_active: false }] } }))).status, 403));
test('multiple staff rows denied', async () => assert.equal((await call(db({ staff: { [LOCAL]: [{ id: 'a', is_active: true }, { id: 'b', is_active: true }] } }))).status, 403));
test('bad signature rejected before resolver', async () => {
  const d = db(); assert.deepEqual(await call(d, { sign: false }), { status: 401, error: 'invalid_signature' }); assert.equal(d.seen.rolesUser.length, 0);
});
test('send still requires request_id idempotency key', async () => {
  assert.deepEqual(await call(db(), { action: 'send_direct_message', data: { recipient_id: 'x', content: 'hej' } }), { status: 400, error: 'invalid_send_request' });
  const ok = await call(db(), { action: 'send_direct_message', data: { recipient_id: 'x', content: 'hej', request_id: '9b2f5c1e-1d2a-4f3b-8c4d-5e6f7a8b9c0d' } });
  assert.equal(ok.userId, LOCAL);
});
