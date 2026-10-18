import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  affectedFromEvents, catchUp, mergeRange, packingsToReload, readHead, isChangefeedMissing,
  type WmsChangeEvent, type WmsChangePage,
} from '@/lib/warehouse/wmsChangefeed';

const ev = (seq: number, p: Partial<WmsChangeEvent> = {}): WmsChangeEvent => ({
  seq, table_name: 'packing_projects', entity_id: `e${seq}`, op: 'UPDATE', packing_id: 'P1', booking_id: null, ...p,
});
/** Fake server: per-org log with head, retention and RLS-like org isolation. */
function server(log: Record<string, WmsChangeEvent[]>, retained: Record<string, number> = {}) {
  return (org: string) => async (after: number, limit: number): Promise<WmsChangePage> => {
    const all = log[org] ?? [];
    return {
      head: all.length ? all[all.length - 1].seq : 0,
      retainedFrom: retained[org] ?? 0,
      events: all.filter((e) => e.seq > after).slice(0, limit),
    };
  };
}
const job = (packingId: string, extra: any = {}) => ({ packingId, bookingId: null, assignedStaff: [], workers: [], ...extra });

describe('WMS changefeed engine', () => {
  it('single change → only that packing is reloaded, others untouched', async () => {
    const cached = { jobs: [job('P1', { v: 1 }), job('P2', { v: 1 })], scans: [] };
    const a = affectedFromEvents([ev(1)]);
    const reload = packingsToReload(cached.jobs, a);
    expect(reload).toEqual(['P1']);
    const merged = mergeRange(cached, reload, { jobs: [job('P1', { v: 2 })], scans: [] });
    expect(merged.jobs.find((j: any) => j.packingId === 'P2')).toBe(cached.jobs[1]);
    expect((merged.jobs.find((j: any) => j.packingId === 'P1') as any).v).toBe(2);
  });
  it('delete tombstone removes the packing from the cached window', () => {
    const cached = { jobs: [job('P1'), job('P2')], scans: [{ packingId: 'P1' }] };
    const r = packingsToReload(cached.jobs, affectedFromEvents([ev(5, { op: 'DELETE' })]));
    const merged = mergeRange(cached, r, { jobs: [], scans: [] });
    expect(merged.jobs.map((j) => j.packingId)).toEqual(['P2']);
    expect(merged.scans).toEqual([]);
  });
  it('booking date move pulls in packings even when not yet cached (moved into window)', () => {
    const a = affectedFromEvents([ev(2, { table_name: 'bookings', booking_id: 'B9', packing_id: null })]);
    expect(packingsToReload([job('P1', { bookingId: 'B1' })], a, ['P9'])).toEqual(['P9']);
    expect(packingsToReload([job('P3', { bookingId: 'B9' })], a)).toEqual(['P3']);
  });
  it('moved out of window → fresh read returns nothing → row removed', () => {
    const cached = { jobs: [job('P1')], scans: [] };
    expect(mergeRange(cached, ['P1'], { jobs: [], scans: [] }).jobs).toEqual([]);
  });
  it('reassignment affects old and new packing and personnel', () => {
    const a = affectedFromEvents([ev(3, { table_name: 'warehouse_assignments', packing_id: 'P2', old_window: { packing_id: 'P1' } })]);
    expect([...a.packingIds].sort()).toEqual(['P1', 'P2']);
    expect(a.personnelChanged).toBe(true);
  });
  it('child item / allocation change reloads parent packing (progress recomputed)', () => {
    const a = affectedFromEvents([ev(4, { table_name: 'packing_list_items', packing_id: 'P7' }), ev(5, { table_name: 'packing_list_item_allocations', packing_id: 'P7' })]);
    expect([...a.packingIds]).toEqual(['P7']);
  });
  it('bootstrap race: head read before snapshot replays writes made during snapshot', async () => {
    const log = { A: [ev(1)] };
    const s = server(log)('A');
    const head = await readHead(s);
    log.A.push(ev(2, { packing_id: 'P2' })); // written while snapshot runs
    const apply = vi.fn(async () => {});
    const r = await catchUp(head, s, apply);
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ seq: 2 })]);
    expect(r).toEqual({ kind: 'ok', cursor: 2, applied: 1 });
  });
  it('offline catch-up pages through missed changes and advances once', async () => {
    const log = { A: Array.from({ length: 1234 }, (_, i) => ev(i + 1)) };
    const apply = vi.fn(async () => {});
    const r = await catchUp(0, server(log)('A'), apply, 500);
    expect(apply).toHaveBeenCalledTimes(1);
    expect((apply.mock.calls[0] as any)[0]).toHaveLength(1234);
    expect(r).toMatchObject({ kind: 'ok', cursor: 1234 });
  });
  it('cursor is not advanced when merge fails', async () => {
    const s = server({ A: [ev(1), ev(2)] })('A');
    await expect(catchUp(0, s, async () => { throw new Error('merge'); })).rejects.toThrow('merge');
  });
  it('retention gap → full snapshot reset', async () => {
    const r = await catchUp(3, server({ A: [ev(10)] }, { A: 8 })('A'), async () => {});
    expect(r).toEqual({ kind: 'reset', cursor: 10 });
  });
  it('tenant isolation: org B cursor never sees org A events', async () => {
    const apply = vi.fn(async () => {});
    const r = await catchUp(0, server({ A: [ev(1), ev(2)], B: [] })('B'), apply);
    expect(apply).not.toHaveBeenCalled();
    expect(r).toMatchObject({ cursor: 0 });
  });
  it('missing server feed is detected for fallback', () => {
    expect(isChangefeedMissing({ code: 'PGRST202' })).toBe(true);
    expect(isChangefeedMissing({ code: '500' })).toBe(false);
  });
});

describe('changefeed SQL design (static)', () => {
  const sql = readFileSync('docs/performance/wms-changefeed.sql', 'utf8');
  it('uses lock-serialized per-org cursor, not a bare sequence', () => {
    expect(sql).toMatch(/UPDATE wms_change_cursors SET last_seq = last_seq \+ 1\s+WHERE organization_id = org RETURNING last_seq/);
    expect(sql).not.toMatch(/bigserial|CREATE SEQUENCE/i);
  });
  it('read RPC is invoker, authenticated-only and org scoped by RLS', () => {
    expect(sql).toMatch(/wms_changes_since[\s\S]*SECURITY INVOKER/);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.wms_changes_since(bigint, int) TO authenticated');
    expect(sql).toContain('USING (organization_id = public.get_user_organization_id(auth.uid()))');
  });
  it('covers all read-model dependencies', () => {
    for (const t of ['packing_projects', 'packing_list_items', 'warehouse_assignments', 'warehouse_calendar_events', 'bookings', 'staff_members', 'packing_list_item_allocations']) {
      expect(sql).toContain(`ON public.${t}`);
    }
  });
});

describe('overview wiring (static)', () => {
  const hook = readFileSync('src/hooks/useWarehouseOpsRange.ts', 'utf8');
  it('normal update does not refetch the whole window when the feed is ready', () => {
    expect(hook).toContain('deltaReady ||');
    expect(hook).toContain('staleTime: deltaReady ? Infinity');
    expect(hook).toContain('refetch: deltaReady ? deltaRefetch');
  });
  it('candidate query is bounded to selected/active/upcoming', () => {
    expect(hook).toContain('rigdowndate.gte.${cutoff},rigdaydate.gte.${cutoff}');
    expect(hook).not.toMatch(/in\("status", \[\.\.\.OPS_OPEN_STATUSES\]\)/);
  });
});
