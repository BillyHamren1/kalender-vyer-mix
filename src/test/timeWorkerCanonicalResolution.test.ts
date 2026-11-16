// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { fetchIdentityContext, resolveWorkerStaff, parseIdentityContext, type StaffRow } from '../../supabase/functions/time-planning-proxy/canonicalWorker';
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SID = 'STAFF-opaque-Fixture/17';
const ctx = (extra = {}) => ({ domain: 'personnel', activationMode: 'read_only', operationsStaffId: SID, organizationId: ORG, ...extra });
const row = (extra = {}): StaffRow => ({ id: SID, organization_id: ORG, tags: [], is_active: true, ...extra });
function deps(body: unknown = ctx(), rows = [row()], account = true, status = 200) {
  return { fetchIdentityContext: async () => ({ status, body }),
    getStaffById: vi.fn(async () => rows), hasAccount: vi.fn(async () => account) };
}
describe('canonical worker identity', () => {
  it.each([{ tags: [] }, { tags: ['Lager'] }, { tags: ['Montage'] }])('allows active accounts regardless of tags %j', async ({ tags }) => {
    expect(await resolveWorkerStaff(deps(ctx(), [row({ tags })]))).toMatchObject({ ok: true });
  });
  it.each(['domain', 'identityDomain'])('accepts %s without activationMode and uses Operations tenant', async (field) => {
    const body = { [field]: 'personnel', operationsStaffId: SID, operationsOrganizationId: ORG, organizationId: OTHER };
    const d = deps(body);
    expect(parseIdentityContext(body)).toEqual({ operationsStaffId: SID, organizationId: ORG });
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: true });
    expect(d.getStaffById).toHaveBeenCalledWith(SID, ORG);
  });
  it('accepts legacy organizationId without activationMode', () => {
    expect(parseIdentityContext({ identityDomain: 'personnel', operationsStaffId: SID, organizationId: ORG }))
      .toEqual({ operationsStaffId: SID, organizationId: ORG });
  });
  it.each([
    { identityDomain: 'admin' }, { domain: 'admin', identityDomain: 'personnel' },
    { operationsOrganizationId: 'invalid' }, { organizationId: undefined },
  ])('rejects invalid/conflicting mapping without fallback %#', (extra) => {
    expect(parseIdentityContext(ctx(extra))).toBeNull();
  });
  it.each([SID, 'BBBBBBBB-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])('preserves exact opaque id %s', async (id) => {
    const d = deps(ctx({ operationsStaffId: id }), [row({ id, email: 'synthetic-changed@invalid.test' })]);
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: true, staff: { id } });
    expect(d.getStaffById).toHaveBeenCalledWith(id, ORG);
    expect(d.hasAccount).toHaveBeenCalledWith(id, ORG);
  });
  it.each([{ domain: 'admin' }, { activationMode: 'write' }, { operationsStaffId: null },
    { operationsStaffId: '' }, { operationsStaffId: ' x' }, { operationsStaffId: 'a'.repeat(129) },
    { organizationId: 'invalid' }])('invalid or unlinked context never falls back', async (extra) => {
    const d = deps(ctx(extra));
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: false, status: 502 });
    expect(d.getStaffById).not.toHaveBeenCalled();
  });
  it('rejects missing staffId', () => { expect(parseIdentityContext({ domain: 'personnel', activationMode: 'read_only', organizationId: ORG })).toBeNull(); });
  it.each([{ rows: [] }, { rows: [row(), row()] }, { rows: [row({ id: SID.toLowerCase() })] }, { rows: [row({ organization_id: OTHER })] },
    { rows: [row({ is_active: false })] }])('denies missing, duplicate, rewritten, cross-tenant or inactive rows %#', async ({ rows }) => {
    expect(await resolveWorkerStaff(deps(ctx(), rows))).toMatchObject({ ok: false, status: 403 });
  });
  it('removed account denies an already-issued worker JWT', async () => {
    expect(await resolveWorkerStaff(deps(ctx(), [row()], false))).toMatchObject({ ok: false, status: 403 });
  });
  it.each([401,403,500])('upstream denial %s stops staff reads', async (status) => {
    const d = deps(null, [row()], true, status);
    expect((await resolveWorkerStaff(d)).ok).toBe(false);
    expect(d.getStaffById).not.toHaveBeenCalled();
  });
  it('database and transport exceptions fail closed', async () => {
    const d = deps(); d.fetchIdentityContext = async () => { throw Error('down'); };
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: false, status: 503 });
  });
});
describe('verified identity transport', () => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  it('sends only worker bearer and agreed read-only body to configured origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(ctx()));
    expect(await fetchIdentityContext('https://time.fixture.invalid/functions/v1', 'Bearer fixture-token', 'public-key', fetcher)).toMatchObject({ status: 200 });
    expect(fetcher).toHaveBeenCalledWith('https://time.fixture.invalid/functions/v1/identity-context', expect.objectContaining({
      method: 'POST', redirect: 'error', headers: { authorization: 'Bearer fixture-token', apikey: 'public-key', 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'personnel', activationMode: 'read_only' }),
    }));
  });
  it.each(['http://time.invalid', 'https://user:pass@time.invalid', 'not a url'])('rejects unsafe endpoint %s', async (url) => {
    const f = vi.fn<typeof fetch>(); expect(await fetchIdentityContext(url, 'Bearer fixture', 'key', f)).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it.each([response({},302), new Response('not json', { headers: { 'content-type': 'application/json' } }),
    new Response('{}'), response({ data: 'x'.repeat(5000) })])('rejects redirect or invalid/oversize response %#', async (res) => {
    expect(await fetchIdentityContext('https://time.invalid', 'Bearer fixture', 'key', async () => res)).toBeNull();
  });
  it('times out even if upstream never resolves', async () => {
    const f = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    expect(await fetchIdentityContext('https://time.invalid', 'Bearer fixture', 'key', f, 10)).toBeNull();
    expect(f.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
