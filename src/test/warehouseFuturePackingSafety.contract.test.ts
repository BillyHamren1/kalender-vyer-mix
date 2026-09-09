import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const importBookings = read('supabase/functions/import-bookings/index.ts');
const repair = read('supabase/functions/_shared/packingRepair.ts');
const repairEdge = read('supabase/functions/repair-packing-items/index.ts');
const packingDetail = read('src/pages/PackingDetail.tsx');
const desktopService = read('src/services/desktopPackingService.ts');

describe('active and future warehouse packing safety', () => {
  it('does not ship the rejected broad production backfill', () => {
    expect(existsSync(resolve(
      process.cwd(),
      'supabase/migrations/20260908235116_harden_future_warehouse_packings.sql',
    ))).toBe(false);
  });

  it('repairs an empty packing only after the packing projection exists', () => {
    const createCall = importBookings.indexOf(
      'const packingResult = await createPackingForBooking(supabase, bookingData, organizationId, projectionSyncCtx);',
    );
    const emptyGuard = importBookings.indexOf("else if ((packingItemCount || 0) === 0)", createCall);
    const repairCall = importBookings.indexOf('const repairResult = await repairPackingItems(', emptyGuard);

    expect(createCall).toBeGreaterThan(-1);
    expect(emptyGuard).toBeGreaterThan(createCall);
    expect(repairCall).toBeGreaterThan(emptyGuard);
    expect(importBookings).toContain('packing_row_creation_failed:');
    expect(importBookings).toContain('packing_row_verification_failed:');
  });

  it('the empty-list repair never deletes packing rows', () => {
    expect(repair).not.toMatch(/\.delete\s*\(/);
    expect(repair).toContain('!existingProductIds.has(p.id)');
  });

  it('the standard Packing page uses the dedicated repair Edge Function', () => {
    expect(packingDetail).toContain('repairPackingItemsDesktop(packing.id)');
    expect(desktopService).toContain("supabase.functions.invoke('repair-packing-items'");
    expect(desktopService).toContain('response.clone().json()');
    expect(repairEdge).toContain("result.code === 'wms_unavailable' ? 502");
    expect(repairEdge).toContain('source: result.source');
  });

  it('keeps realtime invalidation plus polling fallback for staffing', () => {
    const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useWarehousePersonnelWeek.ts'), 'utf8');
    expect(hook).toContain('useRealtimeInvalidation({');
    expect(hook).toContain('refetchInterval: 10_000');
  });
});
