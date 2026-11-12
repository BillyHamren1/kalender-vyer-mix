import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { handle, checkSharedSecret, constantTimeEqual, escapeLike, SCHEMA, type Deps, type AccountRow, type StaffRow } from '../../proposals/time-staff-auth/core';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET = 'x'.repeat(40);

function makeDeps(staff: StaffRow[], accounts: AccountRow[], opts: { limited?: boolean; limiterDown?: boolean } = {}) {
  const writes: string[] = [];
  const deps: Deps = {
    findStaffIdsByEmail: async (e) => staff.filter((s) => (s.email ?? '').toLowerCase() === e).map(({ id, email }) => ({ id, email })),
    findAccountsByStaffId: async (id) => accounts.filter((a) => a.staff_id === id),
    findAccountsByUsername: async (u) => accounts.filter((a) => a.username === u),
    getStaff: async (id) => staff.find((s) => s.id === id) ?? null,
    consumeRateLimit: async () => { if (opts.limiterDown) throw new Error('down'); return !opts.limited; },
    sha256Hex: async (s) => `h(${s.length})`,
  };
  return { deps, writes };
}
const staffRow = (o: Partial<StaffRow> = {}): StaffRow => ({ id: S1, organization_id: ORG_A, name: 'Anna', email: 'anna@x.se', is_active: true, ...o });
const acct = (o: Partial<AccountRow> = {}): AccountRow => ({ staff_id: S1, organization_id: ORG_A, username: 'anna@x.se', password_hash: btoa('Hemligt1'), ...o });
const verify = (identifier: string, password = 'Hemligt1') => JSON.stringify({ schema: SCHEMA, action: 'verify_credentials', identifier, password });
const resolve = (organizationId: string, staffId: string) => JSON.stringify({ schema: SCHEMA, action: 'resolve_active', organizationId, staffId });

describe('shared secret', () => {
  it('fails closed with 503 when the secret is missing or too short', () => {
    expect(checkSharedSecret(undefined, SECRET)?.status).toBe(503);
    expect(checkSharedSecret('short', 'short')?.status).toBe(503);
  });
  it('rejects missing or wrong header with 401 and accepts the exact secret', () => {
    expect(checkSharedSecret(SECRET, null)?.status).toBe(401);
    expect(checkSharedSecret(SECRET, SECRET + 'y')?.status).toBe(401);
    expect(checkSharedSecret(SECRET, SECRET)).toBeNull();
  });
  it('constant-time compare handles length differences', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });
});

describe('verify_credentials', () => {
  it('returns only validated Operations identity on success', async () => {
    const { deps } = makeDeps([staffRow()], [acct()]);
    const r = await handle(deps, verify('  ANNA@x.se '));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ schema: SCHEMA, staff: { staffId: S1, organizationId: ORG_A, displayName: 'Anna', email: 'anna@x.se' } });
  });
  it('supports plain username login like the existing verifier', async () => {
    const { deps } = makeDeps([staffRow({ email: null })], [acct({ username: 'anna' })]);
    const r = await handle(deps, verify('Anna'));
    expect(r.status).toBe(200);
    expect((r.body.staff as { email: unknown }).email).toBeNull();
  });
  it('wrong password and unknown user give the same generic 401', async () => {
    const { deps } = makeDeps([staffRow()], [acct()]);
    const a = await handle(deps, verify('anna@x.se', 'fel'));
    const b = await handle(deps, verify('ingen@x.se'));
    expect(a).toEqual(b);
    expect(a.status).toBe(401);
  });
  it('rejects duplicate username rows instead of picking one', async () => {
    const { deps } = makeDeps([staffRow(), staffRow({ id: S2 })], [acct(), acct({ staff_id: S2 })]);
    expect((await handle(deps, verify('anna@x.se'))).status).toBe(401);
  });
  it('rejects duplicate staff emails across tenants', async () => {
    const { deps } = makeDeps([staffRow({ email: 'dup@x.se' }), staffRow({ id: S2, organization_id: ORG_B, email: 'DUP@x.se' })],
      [acct({ username: 'a' }), acct({ staff_id: S2, organization_id: ORG_B, username: 'b' })]);
    expect((await handle(deps, verify('dup@x.se'))).status).toBe(401);
  });
  it('rejects email and username pointing to different accounts', async () => {
    const { deps } = makeDeps([staffRow({ email: 'p@x.se' }), staffRow({ id: S2, email: null })],
      [acct({ username: 'anna' }), acct({ staff_id: S2, username: 'p@x.se' })]);
    expect((await handle(deps, verify('p@x.se'))).status).toBe(401);
  });
  it('inactive staff with correct password gets 403', async () => {
    const { deps } = makeDeps([staffRow({ is_active: false })], [acct()]);
    expect((await handle(deps, verify('anna@x.se'))).status).toBe(403);
  });
  it('inactive staff with wrong password gets 401 (no status oracle)', async () => {
    const { deps } = makeDeps([staffRow({ is_active: false })], [acct()]);
    expect((await handle(deps, verify('anna@x.se', 'fel'))).status).toBe(401);
  });
  it('account/staff tenant mismatch is rejected', async () => {
    const { deps } = makeDeps([staffRow({ organization_id: ORG_B })], [acct()]);
    expect((await handle(deps, verify('anna@x.se'))).status).toBe(401);
  });
  it('deleted account (no staff_accounts row) is rejected', async () => {
    const { deps } = makeDeps([staffRow()], []);
    expect((await handle(deps, verify('anna@x.se'))).status).toBe(401);
  });
  it('rate limiting returns 429 and limiter outage fails closed with 503', async () => {
    expect((await handle(makeDeps([staffRow()], [acct()], { limited: true }).deps, verify('anna@x.se'))).status).toBe(429);
    expect((await handle(makeDeps([staffRow()], [acct()], { limiterDown: true }).deps, verify('anna@x.se'))).status).toBe(503);
  });
  it('escapes LIKE wildcards so % and _ are literal', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});

describe('strict request schema', () => {
  const { deps } = makeDeps([staffRow()], [acct()]);
  it.each([
    'not json',
    JSON.stringify({ schema: 'v0', action: 'verify_credentials', identifier: 'a', password: 'b' }),
    JSON.stringify({ schema: SCHEMA, action: 'verify_credentials', identifier: 'a', password: 'b', staffId: S1 }),
    JSON.stringify({ schema: SCHEMA, action: 'resolve_active', organizationId: ORG_A, staffId: S1, password: 'x' }),
    JSON.stringify({ schema: SCHEMA, action: 'resolve_active', organizationId: 'nope', staffId: S1 }),
    JSON.stringify({ schema: SCHEMA, action: 'verify_credentials', identifier: 'a', password: 'p'.repeat(5000) }),
  ])('rejects %#', async (body) => {
    expect((await handle(deps, body)).status).toBe(400);
  });
});

describe('resolve_active', () => {
  it('returns identity for active staff with a valid account', async () => {
    const r = await handle(makeDeps([staffRow()], [acct()]).deps, resolve(ORG_A, S1));
    expect(r.status).toBe(200);
  });
  it('cross-tenant lookup is 403', async () => {
    expect((await handle(makeDeps([staffRow()], [acct()]).deps, resolve(ORG_B, S1))).status).toBe(403);
  });
  it('deactivated staff or removed account cuts off with 403', async () => {
    expect((await handle(makeDeps([staffRow({ is_active: false })], [acct()]).deps, resolve(ORG_A, S1))).status).toBe(403);
    expect((await handle(makeDeps([staffRow()], []).deps, resolve(ORG_A, S1))).status).toBe(403);
  });
});

describe('no Scanner/mobile session side effects', () => {
  const dir = path.resolve(__dirname, '../../proposals/time-staff-auth');
  const src = ['core.ts', 'index.ts'].map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');
  it('never touches active_mobile_session_id, scanner tokens or writes', () => {
    expect(src).not.toMatch(/active_mobile_session/);
    expect(src).not.toMatch(/scanner/i);
    expect(src).not.toMatch(/\.(update|insert|upsert|delete)\(/);
  });
  it('success payload has no session ids or sensitive staff fields', async () => {
    const r = await handle(makeDeps([staffRow()], [acct()]).deps, verify('anna@x.se'));
    expect(JSON.stringify(r.body)).not.toMatch(/session|password|hash|rate|salary|phone/i);
  });
});
