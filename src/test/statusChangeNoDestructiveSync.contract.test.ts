import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const importSrc = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/import-bookings/index.ts'),
  'utf8',
);

/** Blocket i normal sync som körs när statusen ändras. */
const statusChangeBlock = (() => {
  const start = importSrc.indexOf('const wasConfirmed = existingBooking.status');
  const end = importSrc.indexOf('// Prepare update data', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return importSrc.slice(start, end);
})();

/** Bulk-loopens CANCELLED-hantering. */
const bulkCancelledBlock = (() => {
  const start = importSrc.indexOf("// Handle CANCELLED bookings");
  const end = importSrc.indexOf('// For historical imports', start);
  return importSrc.slice(start, end);
})();

describe('STEG 3H — ingen destruktiv statushantering i normal sync', () => {
  it('1. CONFIRMED → OFFER: 0 calendar deletes i statusändringsvägen', () => {
    expect(statusChangeBlock).not.toContain("from('calendar_events')");
  });

  it('2. CONFIRMED → OFFER: 0 warehouse deletes', () => {
    expect(statusChangeBlock).not.toContain("from('warehouse_calendar_events')");
  });

  it('3. project.status ändras inte av statusändring', () => {
    expect(statusChangeBlock).not.toContain("from('projects')");
    expect(statusChangeBlock).not.toContain("status: 'cancelled'");
    expect(statusChangeBlock).not.toContain("status: 'planning'");
  });

  it('4. job.status ändras inte av statusändring', () => {
    expect(statusChangeBlock).not.toContain("from('jobs')");
    expect(statusChangeBlock).not.toContain("status: 'active'");
  });

  it('5. packing project (WMS-owned) raderas inte', () => {
    expect(statusChangeBlock).not.toContain("from('packing_projects')");
  });

  it('6. produkter raderas aldrig av statusändring', () => {
    expect(statusChangeBlock).not.toContain("from('booking_products')");
  });

  it('7. inga .delete() alls i statusändringsvägen', () => {
    expect(statusChangeBlock).not.toContain('.delete()');
  });

  it('8. OFFER → CONFIRMED: ingen automatisk reactivation', () => {
    expect(importSrc).not.toContain('Reactivated cancelled projects for re-confirmed booking');
    expect(importSrc).not.toContain('Reactivated cancelled jobs for re-confirmed booking');
    expect(statusChangeBlock).toContain('Planning-owned project/job status left untouched');
  });

  it('9. de-confirmation loggas men muterar inget', () => {
    expect(statusChangeBlock).toContain('destructive_cleanup: false');
  });

  it('10. CANCELLED i normal sync routas till skyddad väg', () => {
    expect(bulkCancelledBlock).toContain('isAutomaticDestructiveSyncEnabled()');
    expect(bulkCancelledBlock).toContain('logBlockedCancellation(');
    expect(bulkCancelledBlock).toContain('applyBookingCancellation(');
  });

  it('11. CANCELLED med flagga AV: ingen mutation, ingen handler', () => {
    const guardIdx = bulkCancelledBlock.indexOf('if (!isAutomaticDestructiveSyncEnabled())');
    const applyIdx = bulkCancelledBlock.indexOf('applyBookingCancellation(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(guardIdx);
    const guarded = bulkCancelledBlock.slice(guardIdx, applyIdx);
    expect(guarded).toContain('continue;');
    expect(guarded).not.toContain('.delete()');
    expect(guarded).not.toContain('.update(');
  });

  it('12. bulk-CANCELLED har ingen egen cleanup kvar', () => {
    expect(bulkCancelledBlock).not.toContain('.delete()');
    expect(bulkCancelledBlock).not.toContain("status: 'cancelled'");
    expect(bulkCancelledBlock).not.toContain("from('warehouse_calendar_events')");
  });

  it('13. fel i cancellation döljs inte som success', () => {
    expect(bulkCancelledBlock).toContain('results.failed++');
    expect(bulkCancelledBlock).toContain('results.errors.push(');
  });

  it('14. endast EN central destruktiv cancellation-väg', () => {
    const occurrences = importSrc.split('applyBookingCancellation(').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // single-booking + bulk, båda via handlern
    expect(importSrc).not.toContain('Removed booking products for CANCELLED booking');
    expect(importSrc).not.toContain('Removed packing project for CANCELLED booking');
  });

  it('15. cancellation är tenant-scoped', () => {
    expect(bulkCancelledBlock).toContain('organization_id: organizationId');
  });
});
