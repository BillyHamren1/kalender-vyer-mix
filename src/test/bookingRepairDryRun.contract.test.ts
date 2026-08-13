/**
 * STEG 4F — kontraktstester för booking-repair-dry-run.
 * Ren diagnostik: 0 mutations, 0 cursor, 0 revision commit.
 */
import { describe, it, expect } from 'vitest';
import {
  validateRepairRequest,
  buildBookingRepairDiff,
  type PlanningSnapshot,
} from '../../supabase/functions/_shared/bookingRepairDiff.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const BOOKING = '2602-13';

const emptyPlanning = (): PlanningSnapshot => ({
  booking: null,
  products: [],
  calendarEvents: [],
  projects: [],
  jobs: [],
  packingProjects: [],
  sourceState: null,
});

const sourceEnvelope = (booking: Record<string, unknown>) => ({
  success: true,
  mode: 'single',
  found: true,
  booking_id: booking.id,
  organization_id: ORG,
  booking,
});

const canonicalBooking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING,
  organization_id: ORG,
  client: 'Acme AB',
  status: 'confirmed',
  booking_number: BOOKING,
  deliveryaddress: 'Storgatan 1',
  rigdaydate: '2026-06-01',
  eventdate: '2026-06-02',
  rigdowndate: '2026-06-03',
  total_amount: 1000,
  updated_at: '2026-05-20T10:00:00.000Z',
  source_version: 5,
  products_complete: true,
  dates_complete: true,
  products: [
    { name: 'Högtalare', quantity: 2, unit_price: 100, total_price: 200 },
    { name: 'Mixer', quantity: 1, unit_price: 500, total_price: 500 },
  ],
  ...over,
});

const planningBooking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING,
  organization_id: ORG,
  client: 'Acme AB',
  status: 'confirmed',
  booking_number: BOOKING,
  deliveryaddress: 'Storgatan 1',
  rigdaydate: '2026-06-01',
  eventdate: '2026-06-02',
  rigdowndate: '2026-06-03',
  total_amount: 1000,
  needs_review: false,
  assigned_to_project: true,
  ...over,
});

const sourceState = (over: Record<string, unknown> = {}) => ({
  booking_id: BOOKING,
  organization_id: ORG,
  last_applied_source_updated_at: '2026-05-20T10:00:00.000Z',
  last_applied_source_version: 5,
  last_applied_source_status: 'confirmed',
  ...over,
});

const events = () => [
  { id: 'e1', event_type: 'rig', source: 'booking', booking_id: BOOKING, source_date: '2026-06-01' },
  { id: 'e2', event_type: 'event', source: 'booking', booking_id: BOOKING, source_date: '2026-06-02' },
  { id: 'e3', event_type: 'rigDown', source: 'booking', booking_id: BOOKING, source_date: '2026-06-03' },
];

const run = (args: Partial<Parameters<typeof buildBookingRepairDiff>[0]> = {}) =>
  buildBookingRepairDiff({
    organizationId: ORG,
    bookingId: BOOKING,
    sourcePayload: sourceEnvelope(canonicalBooking()),
    http: { ok: true, status: 200 },
    planning: emptyPlanning(),
    ...args,
  } as Parameters<typeof buildBookingRepairDiff>[0]);

describe('4F: input validation (fail-closed)', () => {
  it('kräver dry_run === true', () => {
    expect(validateRepairRequest({ organization_id: ORG, booking_id: BOOKING }).ok).toBe(false);
    expect(validateRepairRequest({ organization_id: ORG, booking_id: BOOKING, dry_run: false }).ok).toBe(false);
    expect(validateRepairRequest({ organization_id: ORG, booking_id: BOOKING, dry_run: 'true' }).ok).toBe(false);
  });

  it('accepterar exakt en bokning', () => {
    const v = validateRepairRequest({ organization_id: ORG, booking_id: BOOKING, dry_run: true });
    expect(v).toEqual({ ok: true, organizationId: ORG, bookingId: BOOKING });
  });

  it('avvisar batch/wildcard/apply-parametrar', () => {
    for (const key of ['booking_ids', 'all', 'batch', 'apply', 'confirm', 'since', 'limit']) {
      const v = validateRepairRequest({ organization_id: ORG, booking_id: BOOKING, dry_run: true, [key]: 'x' });
      expect(v.ok, key).toBe(false);
    }
    expect(validateRepairRequest({ organization_id: ORG, booking_id: '*', dry_run: true }).ok).toBe(false);
    expect(validateRepairRequest({ organization_id: ORG, booking_id: 'all', dry_run: true }).ok).toBe(false);
    expect(validateRepairRequest({ organization_id: ORG, booking_id: '26%', dry_run: true }).ok).toBe(false);
  });

  it('kräver giltigt organization_id', () => {
    expect(validateRepairRequest({ organization_id: 'org-1', booking_id: BOOKING, dry_run: true }).ok).toBe(false);
    expect(validateRepairRequest({ booking_id: BOOKING, dry_run: true }).ok).toBe(false);
    expect(validateRepairRequest(null).ok).toBe(false);
    expect(validateRepairRequest([{ dry_run: true }]).ok).toBe(false);
  });
});

describe('4F: matching booking', () => {
  it('ger tom diff när Planning matchar Booking', () => {
    const diff = run({
      planning: {
        ...emptyPlanning(),
        booking: planningBooking(),
        products: [
          { name: 'Högtalare', quantity: 2, unit_price: 100, total_price: 200 },
          { name: 'Mixer', quantity: 1, unit_price: 500, total_price: 500 },
        ],
        calendarEvents: events(),
        sourceState: sourceState(),
      },
    });
    expect(diff.booking_fields.changed).toEqual([]);
    expect(diff.products.add).toEqual([]);
    expect(diff.products.update).toEqual([]);
    expect(diff.products.remove_candidate).toEqual([]);
    expect(diff.calendar.missing_in_planning).toEqual([]);
    expect(diff.calendar.date_mismatch).toEqual([]);
    expect(diff.revision.decision).toBe('already_current');
    expect(diff.dry_run).toBe(true);
    expect(diff.mutations).toBe(0);
  });
});

describe('4F: stale Planning', () => {
  it('flaggar fält, datum och produkter som ligger efter Booking', () => {
    const diff = run({
      sourcePayload: sourceEnvelope(canonicalBooking({
        client: 'Nytt Namn AB',
        eventdate: '2026-06-05',
        updated_at: '2026-05-22T10:00:00.000Z',
        source_version: 7,
      })),
      planning: {
        ...emptyPlanning(),
        booking: planningBooking(),
        products: [{ name: 'Högtalare', quantity: 1, unit_price: 100, total_price: 100 }],
        calendarEvents: events(),
        sourceState: sourceState(),
      },
    });
    expect(diff.revision.decision).toBe('apply');
    expect(diff.booking_fields.changed.map((c) => c.field)).toContain('client');
    expect(diff.booking_fields.changed.map((c) => c.field)).toContain('eventdate');
    expect(diff.products.add).toContain('Mixer');
    expect(diff.products.update).toContain('Högtalare');
    expect(diff.calendar.date_mismatch.some((m) => m.event_type === 'event')).toBe(true);
    expect(diff.mutations).toBe(0);
  });
});

describe('4F: Planning newer state conflict', () => {
  it('flaggar stale källa utan att föreslå apply', () => {
    const diff = run({
      sourcePayload: sourceEnvelope(canonicalBooking({ updated_at: '2026-05-18T10:00:00.000Z', source_version: 3 })),
      planning: { ...emptyPlanning(), booking: planningBooking(), sourceState: sourceState() },
    });
    expect(diff.revision.decision).toBe('stale_source_revision');
    expect(diff.warnings).toContain('planning_state_newer_than_booking');
  });
});

describe('4F: partial products', () => {
  it('markerar remove_candidate men aldrig delete-tillåtelse', () => {
    const diff = run({
      sourcePayload: sourceEnvelope(canonicalBooking({
        products_complete: false,
        products: [{ name: 'Högtalare', quantity: 2, unit_price: 100, total_price: 200 }],
      })),
      planning: {
        ...emptyPlanning(),
        booking: planningBooking(),
        products: [
          { name: 'Högtalare', quantity: 2, unit_price: 100, total_price: 200 },
          { name: 'Gammal produkt', quantity: 1, unit_price: 50, total_price: 50 },
        ],
        sourceState: sourceState(),
      },
    });
    expect(diff.products.source_completeness).toBe('incomplete');
    expect(diff.products.remove_candidate).toContain('Gammal produkt');
    expect(diff.products.delete_would_be_allowed).toBe(false);
    expect(diff.warnings.some((w) => w.startsWith('partial_product_source'))).toBe(true);
  });

  it('tom produktlista från källan ger aldrig raderingsintention', () => {
    const diff = run({
      sourcePayload: sourceEnvelope(canonicalBooking({ products: [] })),
      planning: {
        ...emptyPlanning(),
        booking: planningBooking(),
        products: [{ name: 'Högtalare', quantity: 2, unit_price: 100, total_price: 200 }],
        sourceState: sourceState(),
      },
    });
    expect(diff.products.add).toEqual([]);
    expect(diff.products.delete_would_be_allowed).toBe(false);
    expect(diff.products.remove_candidate).toContain('Högtalare');
  });
});

describe('4F: same IDs across orgs', () => {
  it('flaggar tenant-mismatch på Planning-raden', () => {
    const diff = run({
      planning: {
        ...emptyPlanning(),
        booking: planningBooking({ organization_id: OTHER_ORG }),
        sourceState: sourceState({ organization_id: OTHER_ORG }),
      },
    });
    expect(diff.warnings).toContain('planning_row_organization_mismatch');
    expect(diff.organization_id).toBe(ORG);
  });

  it('avvisar källa som svarar för fel organisation', () => {
    const diff = run({
      sourcePayload: { success: true, mode: 'single', found: true, booking_id: BOOKING, organization_id: OTHER_ORG, booking: canonicalBooking({ organization_id: OTHER_ORG }) },
    });
    expect(diff.source.kind).toBe('error');
    expect(diff.mutations).toBe(0);
  });
});

describe('4F: cancelled candidate', () => {
  it('rapporterar avbokning som diagnostik utan destruktivt förslag', () => {
    const diff = run({
      sourcePayload: { success: true, mode: 'single', found: false, booking_id: BOOKING, organization_id: ORG, reason: 'cancelled' },
      planning: { ...emptyPlanning(), booking: planningBooking(), calendarEvents: events(), sourceState: sourceState() },
    });
    expect(diff.source.kind).toBe('absent');
    expect(diff.warnings).toContain('cancellation_candidate_diagnostic_only');
    expect(diff.calendar.remove_candidate).toEqual([]);
    expect(diff.products.delete_would_be_allowed).toBe(false);
    expect(diff.mutations).toBe(0);
  });
});

describe('4F: malformed revision', () => {
  it('markerar ojämförbar revision', () => {
    const diff = run({
      sourcePayload: sourceEnvelope(canonicalBooking({ updated_at: 'inte-ett-datum', source_version: null })),
      planning: { ...emptyPlanning(), booking: planningBooking(), sourceState: sourceState() },
    });
    expect(['incomparable_source_revision', 'invalid_incoming_revision']).toContain(diff.revision.decision);
    expect(diff.warnings.some((w) => w.includes('revision'))).toBe(true);
  });

  it('hanterar HTTP-fel fail-closed', () => {
    const diff = run({ sourcePayload: null, http: { ok: false, status: 500 } });
    expect(diff.source.kind).toBe('error');
    expect(diff.booking_fields.changed).toEqual([]);
    expect(diff.mutations).toBe(0);
  });
});

describe('4F: separation av ägandeskap', () => {
  it('visar Planning-ägt och WMS-ägt state separat från diffen', () => {
    const diff = run({
      planning: {
        ...emptyPlanning(),
        booking: planningBooking({ needs_review: true, rig_time_locked: true }),
        packingProjects: [{ name: 'Pack', status: 'packing', control_status: 'pending', client_name: 'Acme AB' }],
        sourceState: sourceState(),
      },
    });
    const planningOwned = diff.planning_owned_state.booking as Record<string, unknown>;
    expect(planningOwned.needs_review).toBe(true);
    expect(planningOwned.rig_time_locked).toBe(true);
    expect(diff.booking_fields.changed.map((c) => c.field)).not.toContain('needs_review');
    const wms = diff.wms_owned_state.packing_projects as Record<string, unknown>[];
    expect(wms[0].status).toBe('packing');
    expect(diff.projections.packing_projects.booking_owned_drift).toEqual([]);
  });

  it('rör inte Planning-only kalenderhändelser', () => {
    const diff = run({
      planning: {
        ...emptyPlanning(),
        booking: planningBooking(),
        calendarEvents: [...events(), { id: 'x1', event_type: 'activity', booking_id: BOOKING, source_date: '2026-06-02' }],
        sourceState: sourceState(),
      },
    });
    expect(diff.calendar.remove_candidate).toEqual([]);
    expect(diff.calendar.planning_only_events.map((e) => e.event_id)).toEqual(['x1']);
  });
});
