import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readWarehouseSync, mergeJobWarehouseSync, resolveProductSyncScope, isProductScopeRestricted, parseWarehouseSync,
} from '../../supabase/functions/_shared/productSyncScope';
import { reserveSameRevisionProductRepair, setProductsPending } from '../../supabase/functions/_shared/productRepairReservation';

const SALES_CONFLICT = { status: 'attention_required', code: 'wms_lifecycle_conflict', products_wms_accepted: false };
const ACCEPTED = { status: 'ok', products_wms_accepted: true };
const fn = (p: string) => readFileSync(`supabase/functions/${p}`, 'utf8');

describe('Sales warehouse_sync signal', () => {
  it('Sales d247a2074 payload restricts products', () => {
    const sig = readWarehouseSync({ booking_id: 'b', warehouse_sync: SALES_CONFLICT });
    expect(isProductScopeRestricted(sig)).toBe(true);
    expect(sig?.code).toBe('wms_lifecycle_conflict');
  });
  it('attention_required without explicit accept is fail-closed', () => {
    expect(isProductScopeRestricted(parseWarehouseSync({ status: 'attention_required' }))).toBe(true);
  });
  it('missing signal keeps legacy behaviour (allowed)', () => {
    expect(resolveProductSyncScope({ job: null, canonical: null }).productsAllowed).toBe(true);
  });
  it('restriction survives canonical refetch without signal', () => {
    const s = resolveProductSyncScope({ job: parseWarehouseSync(SALES_CONFLICT), canonical: readWarehouseSync({ id: 'b' }) });
    expect(s.productsAllowed).toBe(false);
    expect(s.restrictedBy).toEqual(['job']);
  });
  it('canonical restriction alone also restricts', () => {
    expect(resolveProductSyncScope({ job: null, canonical: readWarehouseSync({ meta: { warehouse_sync: SALES_CONFLICT } }) }).productsAllowed).toBe(false);
  });
});

describe('job coalescing', () => {
  const r = parseWarehouseSync(SALES_CONFLICT), a = parseWarehouseSync(ACCEPTED);
  it('neutral later event never clears restriction', () => {
    expect(isProductScopeRestricted(mergeJobWarehouseSync(r, null))).toBe(true);
    expect(isProductScopeRestricted(mergeJobWarehouseSync(r, parseWarehouseSync({ status: 'ok' })))).toBe(true);
  });
  it('later explicit accept lifts restriction', () => {
    expect(isProductScopeRestricted(mergeJobWarehouseSync(r, a))).toBe(false);
  });
  it('later restriction overrides earlier accept', () => {
    expect(isProductScopeRestricted(mergeJobWarehouseSync(a, r))).toBe(true);
  });
});

describe('same-revision product repair RPC wrappers', () => {
  const inc = { sourceUpdatedAt: '2026-11-25T10:00:00Z', sourceVersion: 7, sourceStatus: 'CONFIRMED' };
  const fake = (data: any, error: any = null) => ({ calls: [] as any[], rpc(name: string, args: any) { this.calls.push([name, args]); return Promise.resolve({ data, error }); } });
  it('reserved returns token', async () => {
    const sb = fake({ decision: 'reserved', reservation_token: 't1' });
    const r = await reserveSameRevisionProductRepair(sb, { bookingId: 'b', organizationId: 'o', incoming: inc });
    expect(r).toMatchObject({ ok: true, reservationToken: 't1' });
    expect(sb.calls[0][1]).toMatchObject({ p_organization_id: 'o', p_booking_id: 'b', p_source_version: 7 });
  });
  it('not_pending / missing RPC stay already_current (no repair)', async () => {
    expect((await reserveSameRevisionProductRepair(fake({ decision: 'not_pending' }), { bookingId: 'b', organizationId: 'o', incoming: inc })).ok).toBe(false);
    expect((await reserveSameRevisionProductRepair(fake(null, { message: 'function does not exist' }), { bookingId: 'b', organizationId: 'o', incoming: inc })).decision).toBe('rpc_unavailable');
  });
  it('invalid revision never calls RPC', async () => {
    const sb = fake({ decision: 'reserved', reservation_token: 'x' });
    expect((await reserveSameRevisionProductRepair(sb, { bookingId: 'b', organizationId: 'o', incoming: { sourceStatus: 'CONFIRMED' } as any })).ok).toBe(false);
    expect(sb.calls.length).toBe(0);
  });
  it('marker requires token and reports set', async () => {
    const sb = fake({ decision: 'set' });
    expect((await setProductsPending(sb, { bookingId: 'b', organizationId: 'o', reservationToken: 't', pending: true })).ok).toBe(true);
    expect((await setProductsPending(fake({ decision: 'not_lock_owner' }), { bookingId: 'b', organizationId: 'o', reservationToken: 't', pending: true })).ok).toBe(false);
  });
});

describe('webhook → job → import wiring', () => {
  const recv = fn('receive-booking/index.ts');
  const worker = fn('process-sync-jobs/index.ts');
  const imp = fn('import-bookings/index.ts');
  it('receive-booking persists scope and fails closed (503) when restricted scope cannot be stored', () => {
    expect(recv).toMatch(/record_booking_sync_job_scope/);
    expect(recv).toMatch(/if \(restricted\)[\s\S]{0,200}status: 503/);
  });
  it('worker merges job scope and forwards it to import', () => {
    expect(worker).toMatch(/mergeJobWarehouseSync\(/);
    expect(worker).toMatch(/warehouse_sync: toWarehouseSyncPayload\(group\.warehouse_sync\)/);
  });
  it('import gates every product/packing write path on scope, not dates/calendar', () => {
    expect(imp).toMatch(/if \(\(needsProductUpdate \|\| !existingBooking\) && bookingProductScope\.productsAllowed\)/);
    expect(imp).toMatch(/needsProductUpdate = false;\s*needsProductRecovery = false;/);
    // calendar reconcile still runs on the unchanged path
    expect(imp).toMatch(/Always reconcile calendar even for unchanged bookings\s*await runCalendarReconcile\(\);/);
  });
  it('restricted runs are not reported as product updates', () => {
    expect(imp).toMatch(/products_updated_bookings = results\.products_updated_bookings\.filter/);
    expect(imp).toMatch(/product_scope_deferred/);
  });
  it('pending marker is written with the lock token before commit; repair only when products allowed', () => {
    const marker = imp.indexOf('setProductsPending(supabase');
    const commit = imp.indexOf('const committed = await commitCanonicalRevision');
    expect(marker).toBeGreaterThan(0);
    expect(marker).toBeLessThan(commit);
    expect(imp).toMatch(/already_current' && singleProductScope\?\.productsAllowed/);
  });
});
