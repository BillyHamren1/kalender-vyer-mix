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
  const start = importSrc.indexOf('// STEG 3L: CANCELLED i normal sync');
  const end = importSrc.indexOf('// Extract client name', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
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

  it('10. CANCELLED i normal sync blir endast kandidat (STEG 3L)', () => {
    expect(bulkCancelledBlock).toContain('logBlockedCancellation(');
    expect(bulkCancelledBlock).toContain('results.cancellation_candidates.push(');
    expect(bulkCancelledBlock).not.toContain('applyBookingCancellation(');
  });

  it('11. CANCELLED muterar aldrig — oavsett feature flag', () => {
    expect(bulkCancelledBlock).not.toContain('isAutomaticDestructiveSyncEnabled');
    expect(bulkCancelledBlock).toContain('continue;');
    expect(bulkCancelledBlock).not.toContain('.delete()');
    expect(bulkCancelledBlock).not.toContain('.update(');
  });

  it('12. bulk-CANCELLED har ingen egen cleanup kvar', () => {
    expect(bulkCancelledBlock).not.toContain('.delete()');
    expect(bulkCancelledBlock).not.toContain("status: 'cancelled'");
    expect(bulkCancelledBlock).not.toContain("from('warehouse_calendar_events')");
  });

  it('13. historical CANCELLED går samma icke-destruktiva väg', () => {
    expect(bulkCancelledBlock).toContain('historical_cancelled_candidate');
    expect(importSrc).not.toContain('Historical mode: Processing CANCELLED booking');
  });

  it('14. import-bookings kan inte nå destruktiv cancellation alls', () => {
    expect(importSrc).not.toContain('applyBookingCancellation');
    expect(importSrc).not.toContain('apply_booking_cancellation_atomic');
    expect(importSrc).not.toContain('cancellation-handler.ts\'');
    expect(importSrc).not.toContain('Removed booking products for CANCELLED booking');
    expect(importSrc).not.toContain('Removed packing project for CANCELLED booking');
  });


  it('15. cancellation är tenant-scoped', () => {
    expect(bulkCancelledBlock).toContain('organization_id: organizationId');
  });
});
