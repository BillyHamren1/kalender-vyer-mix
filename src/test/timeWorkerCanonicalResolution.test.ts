import { describe, it, expect, vi } from 'vitest';
import { resolveWorkerStaff, parseIdentityContext, type ResolveDeps, type StaffRow } from '../../proposals/time-planning-proxy/canonicalWorker';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SID = 'staff_1742198732_Ab9X'; // non-UUID Operations staff id (TEXT)
const ctx = (o: Record<string, unknown> = {}) => ({ domain: 'personnel', activationMode: 'read_only', operationsStaffId: SID, organizationId: ORG, ...o });
const row = (o: Partial<StaffRow> = {}): StaffRow => ({ id: SID, organization_id: ORG, is_active: true, email: 'x+synthetic@time.invalid', ...o });

function deps(idc: { status: number; body: unknown } | null, rows: StaffRow[] = [row()]) {
  const legacyByEmail = vi.fn(async () => ({ ok: true as const, staff: row({ id: 'legacy' }), via: 'legacy_email' as const }));
  const getStaffById = vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null);
  const d: ResolveDeps = { fetchIdentityContext: async () => idc, getStaffById, legacyByEmail };
  return { d, legacyByEmail, getStaffById };
}

describe('Operations-backed worker resolution', () => {
  it('uses exact non-UUID staff id and never the email path', async () => {
    const { d, legacyByEmail, getStaffById } = deps({ status: 200, body: ctx() });
    const r = await resolveWorkerStaff(d);
    expect(r).toMatchObject({ ok: true, via: 'operations_canonical', staff: { id: SID } });
    expect(getStaffById).toHaveBeenCalledWith(SID);
    expect(legacyByEmail).not.toHaveBeenCalled();
  });
  it('does not lowercase or rewrite the staff id', async () => {
    const { d } = deps({ status: 200, body: ctx() }, [row({ id: SID.toLowerCase() })]);
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: false, code: 'personnel_not_mapped' });
  });
  it('rejects organization mismatch and inactive staff', async () => {
    expect(await resolveWorkerStaff(deps({ status: 200, body: ctx({ organizationId: OTHER }) }).d)).toMatchObject({ ok: false, status: 409 });
    expect(await resolveWorkerStaff(deps({ status: 200, body: ctx() }, [row({ is_active: false })]).d)).toMatchObject({ ok: false, status: 403 });
  });
  it('fails closed (no email fallback) on invalid payload, auth failure or outage', async () => {
    for (const idc of [{ status: 200, body: ctx({ domain: 'admin' }) }, { status: 200, body: ctx({ operationsStaffId: ' x' }) },
      { status: 200, body: ctx({ organizationId: 'nope' }) }, { status: 401, body: null }, { status: 500, body: null }, null]) {
      const { d, legacyByEmail } = deps(idc);
      expect((await resolveWorkerStaff(d)).ok).toBe(false);
      expect(legacyByEmail).not.toHaveBeenCalled();
    }
  });
  it('only an explicit unlinked personnel profile uses the legacy email path', async () => {
    const { d, legacyByEmail } = deps({ status: 200, body: { domain: 'personnel', activationMode: 'read_only', operationsStaffId: null } });
    expect(await resolveWorkerStaff(d)).toMatchObject({ ok: true, via: 'legacy_email' });
    expect(legacyByEmail).toHaveBeenCalledOnce();
  });
  it('parser keeps the opaque id verbatim', () => {
    expect(parseIdentityContext(ctx())).toEqual({ kind: 'operations', operationsStaffId: SID, organizationId: ORG });
  });
});
