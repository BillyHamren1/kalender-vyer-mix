import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BOOKING_OWNED_PROJECT_FIELDS,
  PLANNING_OWNED_PROJECT_FIELDS,
  BOOKING_OWNED_JOB_FIELDS,
  PLANNING_OWNED_JOB_FIELDS,
  BOOKING_OWNED_PACKING_FIELDS,
  WMS_OWNED_PACKING_FIELDS,
  canMutateProjection,
  canDestroyProjection,
  buildProjectionPatch,
  hasProjectionChanges,
  assertNoProtectedFields,
  type ProjectionSyncContext,
} from '../../supabase/functions/_shared/projectionSourceAuthority';

const okCtx = (over: Partial<ProjectionSyncContext> = {}): ProjectionSyncContext => ({
  sourceFound: true,
  revisionValidated: true,
  leaseOwned: true,
  organizationId: 'org-1',
  bookingId: 'b-1',
  ...over,
});

const importSrc = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/import-bookings/index.ts'),
  'utf8',
);

describe('STEG 3F — projection source authority', () => {
  it('1. field ownership: Planning-ägda projektfält är inte Booking-ägda', () => {
    for (const f of PLANNING_OWNED_PROJECT_FIELDS) {
      expect(BOOKING_OWNED_PROJECT_FIELDS).not.toContain(f as never);
    }
    expect(PLANNING_OWNED_PROJECT_FIELDS).toContain('planning_status');
    expect(PLANNING_OWNED_PROJECT_FIELDS).toContain('status');
    expect(PLANNING_OWNED_PROJECT_FIELDS).toContain('internalnotes');
    expect(PLANNING_OWNED_PROJECT_FIELDS).toContain('project_leader');
  });

  it('2. jobs: lokal status är Planning-ägd', () => {
    expect(BOOKING_OWNED_JOB_FIELDS).toEqual(['name']);
    expect(PLANNING_OWNED_JOB_FIELDS).toContain('status');
  });

  it('3. WMS-ägd fysisk packstatus skyddas', () => {
    for (const f of ['status', 'control_status', 'control_completed_at', 'signed_at', 'needs_packing_review', 'warehouse_project_id']) {
      expect(WMS_OWNED_PACKING_FIELDS).toContain(f as never);
      expect(BOOKING_OWNED_PACKING_FIELDS).not.toContain(f as never);
    }
  });

  it('4. mutation gate: stale revision → ingen mutation', () => {
    expect(canMutateProjection(okCtx({ revisionValidated: false })).allowed).toBe(false);
  });

  it('5. mutation gate: lease loss → ingen mutation', () => {
    expect(canMutateProjection(okCtx({ leaseOwned: false })).reason).toBe('lease_not_owned');
  });

  it('6. mutation gate: source not found / source error → ingen mutation', () => {
    expect(canMutateProjection(okCtx({ sourceFound: false })).allowed).toBe(false);
    expect(canMutateProjection(okCtx({ hadSourceError: true })).allowed).toBe(false);
  });

  it('7. organization isolation: saknad org/booking blockerar', () => {
    expect(canMutateProjection(okCtx({ organizationId: null })).reason).toBe('missing_organization_id');
    expect(canMutateProjection(okCtx({ bookingId: null })).reason).toBe('missing_booking_id');
  });

  it('8. happy path tillåter mutation', () => {
    expect(canMutateProjection(okCtx())).toEqual({ allowed: true });
  });

  it('9. normal found:true-sync är ALDRIG destruktiv', () => {
    expect(canDestroyProjection(okCtx({ projectionComplete: true })).allowed).toBe(false);
    expect(canDestroyProjection(okCtx()).reason).toBe('projection_source_incomplete');
    expect(canDestroyProjection(okCtx({ leaseOwned: false })).allowed).toBe(false);
  });

  it('10. ingen blanket upsert: bara allowlist passerar', () => {
    const { patch, blockedProtected } = buildProjectionPatch('packing_projects', {
      name: 'Kund - 2026-01-01',
      client_name: 'Kund',
      status: 'packed',
      control_status: 'signed',
      warehouse_project_id: 'wp-1',
      random_external_field: 'x',
    });
    expect(patch).toEqual({ name: 'Kund - 2026-01-01', client_name: 'Kund' });
    expect(blockedProtected).toEqual(expect.arrayContaining(['status', 'control_status', 'warehouse_project_id', 'random_external_field']));
  });

  it('11. partial source: saknat fält nollar aldrig befintlig data', () => {
    const { patch, skippedAbsent } = buildProjectionPatch('packing_projects', {
      name: 'X',
      start_date: undefined,
      end_date: undefined,
      notes: undefined,
    });
    expect(patch).toEqual({ name: 'X' });
    expect(skippedAbsent).toEqual(['start_date', 'end_date', 'notes']);
  });

  it('12. Planning team/assignment/task-state kan inte skrivas via projects-patch', () => {
    const { patch } = buildProjectionPatch('projects', {
      client: 'Kund',
      status: 'cancelled',
      planning_status: 'needs_planning',
      project_leader: 'Anna',
      internalnotes: 'lokal anteckning',
      name: 'Manuellt namn',
    });
    expect(patch).toEqual({ client: 'Kund' });
  });

  it('13. jobs-patch skriver aldrig lokal status', () => {
    const { patch } = buildProjectionPatch('jobs', { name: 'Job', status: 'completed' });
    expect(patch).toEqual({ name: 'Job' });
  });

  it('14. retry-idempotens: tom patch ger ingen skrivning', () => {
    const { patch } = buildProjectionPatch('packing_projects', { name: undefined, notes: undefined });
    expect(hasProjectionChanges(patch)).toBe(false);
  });

  it('15. assertNoProtectedFields kastar på skyddade fält', () => {
    expect(() => assertNoProtectedFields('packing_projects', { status: 'packed' })).toThrow();
    expect(() => assertNoProtectedFields('packing_projects', { name: 'ok' })).not.toThrow();
  });
});

describe('STEG 3F — import-bookings wiring', () => {
  it('16. createPackingForBooking tar emot projection-kontext och gate:as', () => {
    expect(importSrc).toContain("createPackingForBooking(supabase, bookingData, organizationId, projectionSyncCtx)");
    expect(importSrc).toContain('canMutateProjection(projectionCtx)');
  });

  it('17. packing-projection är tenant-scoped (org + booking)', () => {
    const fn = importSrc.slice(
      importSrc.indexOf('const createPackingForBooking'),
      importSrc.indexOf('interface ProductData'),
    );
    const selectBlock = fn.slice(fn.indexOf(".from('packing_projects')"), fn.indexOf('if (checkError)'));
    expect(selectBlock).toContain(".eq('organization_id', orgId)");
    const updateBlock = fn.slice(fn.indexOf('.update({ ...syncFields'), fn.indexOf('if (updateError)'));
    expect(updateBlock).toContain(".eq('booking_id', booking.id)");
    expect(updateBlock).toContain(".eq('organization_id', orgId)");
  });

  it('18. DB-fel i projection → results.failed (partial, inte completed)', () => {
    expect(importSrc).toContain('packing_projection_failed:');
    expect(importSrc).toContain('assertLeaseOwned(\'packing_projection\')');
  });

  it('19. normal sync-vägen innehåller ingen delete av packing_projects', () => {
    const start = importSrc.indexOf('// Create packing project for confirmed bookings');
    const tail = importSrc.slice(start, start + 1200);
    expect(tail).not.toContain(".from('packing_projects')\n            .delete()");
  });

  it('20. cancellation-safety: STEG 3L — import-bookings når aldrig cancellation-handlern', () => {
    expect(importSrc).not.toContain('applyBookingCancellation');
  });
});
