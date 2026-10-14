import { describe, expect, it, vi } from 'vitest';
import { authorizePackingSync, isPackingSyncWorkerAuthorized } from '../../supabase/functions/_shared/packingSyncAuth';
import { buildTimeWmsProjectionRequest, fetchTimeWmsProjection } from '../../supabase/functions/_shared/timeWmsProjection';

function adminFor(roles: Array<{role: string}>, roleError: unknown = null) {
  const filters: unknown[] = [];
  const query: any = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
    then: (resolve: any) => Promise.resolve({ data: roles, error: roleError }).then(resolve) };
  return { filters, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user', email: 'user@test.invalid', user_metadata: { role: 'admin' } } } }) }, from: vi.fn(() => query) };
}
describe('packing sync authorization', () => {
  it('rejects missing token without database lookup', async () => {
    const admin = adminFor([]);
    await expect(authorizePackingSync(admin, '', 'org-b', 'secret')).rejects.toMatchObject({ status: 401 });
    expect(admin.from).not.toHaveBeenCalled();
  });
  it('does not trust metadata roles or a requested tenant without membership', async () => {
    const admin = adminFor([]);
    await expect(authorizePackingSync(admin, 'user-jwt', 'org-b', 'secret')).rejects.toMatchObject({ status: 403 });
    expect(admin.filters).toContainEqual(['organization_id', 'org-b']);
    expect(admin.filters).toContainEqual(['user_id', 'verified-user']);
  });
  it.each(['admin', 'lager', 'projekt', 'forsaljning'])('allows existing legitimate %s callers from scoped role table', async role => {
    const result = await authorizePackingSync(adminFor([{ role }]), 'user-jwt', 'org-a', 'secret');
    expect(result.actor).toMatchObject({ personnelId: 'verified-user', organizationId: 'org-a' });
  });
  it('fails closed on role lookup errors', async () => {
    await expect(authorizePackingSync(adminFor([{role:'admin'}], {message:'failed'}), 'jwt', 'org-a', 'secret')).rejects.toMatchObject({ status: 503 });
  });
  it('authenticates service separately without impersonating a user', async () => {
    const admin = adminFor([]);
    expect(await authorizePackingSync(admin, 'secret', 'org-a', 'secret')).toEqual({service:true,actor:null});
    expect(admin.auth.getUser).not.toHaveBeenCalled();
  });
  it('sends an explicit signed read-only service actor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ bookingId: 'booking', reservationId: 'res', revision: 1, lines: [] })));
    const request = buildTimeWmsProjectionRequest({ bookingId:'booking',bookingNumber:'123',deviceId:'planning-service:operations-booking-sync',actor:{kind:'service',serviceId:'operations-booking-sync',organizationId:'org-a',label:'Operations booking sync'} });
    const result = await fetchTimeWmsProjection(request, {hmacSecret:'test-secret',fetchImpl});
    expect(result.ok).toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.actor.personnelId).toBeUndefined();
    expect(body.actor.kind).toBe('service');
  });
});

describe('worker credentials', () => {
  it.each([['', null, '', '', false], ['anon', null, 'svc', 'cron', false], ['wrong', 'wrong', 'svc', 'cron', false], ['svc', null, 'svc', 'cron', true], ['', 'cron', 'svc', 'cron', true]] as const)('rejects blank/wrong and permits exact trusted credentials', (token, supplied, service, cron, expected) => {
    expect(isPackingSyncWorkerAuthorized(token, supplied, service, cron)).toBe(expected);
  });
});
