import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const HANDLER = read('supabase/functions/_shared/cancellation-handler.ts');
const WATCH = read('supabase/functions/booking-cancellation-watch/index.ts');
const IMPORT = read('supabase/functions/import-bookings/index.ts');
const RECONCILE = read('supabase/functions/reconcile-booking-status/index.ts');
const LIST = read('src/components/project/IncomingBookingsList.tsx');
const REVISION = read('supabase/functions/_shared/appliedSourceRevision.ts');

describe('manuell avbokning (människa bekräftar)', () => {
  it('endast manualApproval=true kringgår automatikspärren', () => {
    expect(HANDLER).toContain('if (!manualApproval && !isAutomaticDestructiveSyncEnabled())');
    expect(HANDLER).toContain("options?.manualApproval === true");
  });

  it('automatiska callers skickar aldrig manualApproval', () => {
    expect(IMPORT).not.toContain('manualApproval');
    expect(RECONCILE).not.toContain('manualApproval');
  });

  it('endast booking-cancellation-watch apply-vägen använder manualApproval', () => {
    expect(WATCH).toContain('{ manualApproval: true, approvedBy: userId }');
  });
});

describe('booking-cancellation-watch', () => {
  it('läser booking_changes med tabellens verkliga tidskolumn', () => {
    expect(REVISION).toContain(".select('change_type, new_values, changed_at')");
    expect(REVISION).toContain(".order('changed_at', { ascending: false })");
    expect(REVISION).not.toContain(".select('change_type, new_values, created_at')");
  });

  it('scan muterar aldrig bokningar — bara kandidattabellen', () => {
    const scanStart = WATCH.indexOf("if (action === \"scan\")");
    const scanEnd = WATCH.indexOf("if (action === \"dismiss\")");
    const scan = WATCH.slice(scanStart, scanEnd);
    expect(scanStart).toBeGreaterThan(-1);
    expect(scan).not.toContain('applyBookingCancellation');
    expect(scan).not.toContain('.from("bookings")\n      .update');
    expect(scan).toContain('booking_cancellation_candidates');
  });

  it('apply verifierar mot källan igen innan avbokning', () => {
    const applyIdx = WATCH.indexOf('if (action === "apply")');
    const inspectIdx = WATCH.indexOf('inspectBooking(admin, importApiKey, booking as any)');
    const cancelIdx = WATCH.indexOf('applyBookingCancellation(');
    expect(applyIdx).toBeLessThan(inspectIdx);
    expect(inspectIdx).toBeLessThan(cancelIdx);
    expect(WATCH).toContain('source_not_cancelled');
  });

  it('allt är organisationsscopat', () => {
    expect(WATCH).toContain('.eq("organization_id", organizationId)');
    expect(WATCH).toContain('booking_not_found_in_organization');
  });

  it('kräver evaluateDestructiveAction (tombstone), inte tomt svar', () => {
    expect(WATCH).toContain('evaluateDestructiveAction');
    expect(WATCH).toContain("decision.action === \"cancellation\"");
  });
});

describe('inkorgen visar avbokningar separat', () => {
  it('avbokade filtreras bort ur "Nya"', () => {
    expect(LIST).toContain('const newBookings = bookings.filter((b) => !cancelledIds.has(b.id))');
    expect(LIST).toContain('newUnplanned');
  });

  it('egen röd sektion med bekräfta-knapp', () => {
    expect(LIST).toContain('Avbokade i bokningssystemet');
    expect(LIST).toContain('Bekräfta avbokning');
  });

  it('spärrar Placera tills Booking-status har verifierats', () => {
    expect(LIST).toContain('cancellationCheckPending');
    expect(LIST).toContain('cancellationCheckFailed');
    expect(LIST).toContain('Placering är spärrad tills kontrollen lyckas.');
  });
});
