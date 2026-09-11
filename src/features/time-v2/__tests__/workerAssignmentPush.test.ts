import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  handleWorkerAssignmentPush,
  parseWorkerPushRequest,
  resolveAffectedWorkerIds,
} from '../../../../supabase/functions/time-planning-proxy/workerAssignmentPush';

const ORG = '11111111-1111-4111-8111-111111111111';
const STAFF_A = '22222222-2222-4222-8222-222222222222';
const STAFF_B = '33333333-3333-4333-8333-333333333333';
const BOOKING = '44444444-4444-4444-8444-444444444444';

type Rows = Record<string, unknown[]>;

/** Minimal chainable Supabase-ish stub: every filter is a no-op, await returns the table rows. */
const makeAdmin = (rows: Rows, failTable?: string) => {
  const builder = (table: string) => {
    const result = failTable === table
      ? { data: null, error: { message: 'boom' } }
      : { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'is', 'not', 'or', 'order', 'limit', 'ilike', 'neq', 'filter']) {
      chain[method] = () => chain;
    }

    return chain;
  };
  return { from: (table: string) => builder(table) };
};

const baseRows = (): Rows => ({
  calendar_events: [{
    id: '55555555-5555-4555-8555-555555555555',
    resource_id: 'team-1',
    booking_id: BOOKING,
    title: 'Kund AB',
    start_time: '2026-09-20T07:00:00.000Z',
    end_time: '2026-09-20T15:00:00.000Z',
    event_type: 'rig',
    delivery_address: 'Testgatan 1',
    booking_number: '2609-1',
    organization_id: ORG,
    source_date: '2026-09-20',
  }],
  staff_assignments: [{
    id: 'a1', staff_id: STAFF_A, team_id: 'team-1', assignment_date: '2026-09-20', organization_id: ORG,
  }],
  staff_members: [{
    id: STAFF_A, organization_id: ORG, name: 'Anna', email: 'anna@example.com', role: 'Tekniker', is_active: true,
  }],
  bookings: [{
    id: BOOKING, organization_id: ORG, status: 'CONFIRMED', booking_number: '2609-1', client: 'Kund AB',
    version: 3, updated_at: '2026-09-11T10:00:00.000Z', deliveryaddress: 'Testgatan 1',
  }],
  projects: [],
  booking_products: [],
  booking_attachments: [],
  project_files: [],
});

describe('parseWorkerPushRequest', () => {
  it('accepts only uuid-shaped ids and dedups them', () => {
    const parsed = parseWorkerPushRequest({
      bookingIds: [BOOKING, BOOKING, 'nope', ''],
      staffId: STAFF_B,
      reason: 'booking_fields_changed',
    });
    expect(parsed.bookingIds).toEqual([BOOKING]);
    expect(parsed.staffIds).toEqual([STAFF_B]);
    expect(parsed.reason).toBe('booking_fields_changed');
  });

  it('falls back to a stable default reason', () => {
    expect(parseWorkerPushRequest({}).reason).toBe('planning_mutation');
  });
});

describe('resolveAffectedWorkerIds', () => {
  it('resolves everyone assigned to the touched booking day/team plus explicit ids', async () => {
    const resolved = await resolveAffectedWorkerIds({
      admin: makeAdmin(baseRows()),
      organizationId: ORG,
      bookingIds: [BOOKING],
      staffIds: [STAFF_B],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(new Set(resolved.staffIds)).toEqual(new Set([STAFF_A, STAFF_B]));
  });

  it('fails closed when the calendar read fails', async () => {
    const resolved = await resolveAffectedWorkerIds({
      admin: makeAdmin(baseRows(), 'calendar_events'),
      organizationId: ORG,
      bookingIds: [BOOKING],
      staffIds: [],
    });
    expect(resolved.ok).toBe(false);
  });
});

describe('handleWorkerAssignmentPush', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { head: 'v2' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ctx = (rows: Rows, body: Record<string, unknown>) => ({
    admin: makeAdmin(rows),
    organizationId: ORG,
    adapterUrl: 'https://pklkhhfvgmexsrkkpkzt.supabase.co/functions/v1',
    signingSeed: 'test-seed-value-for-signing-0123456789',
    body,
  });

  it('sends one signed worker.assignments.sync per affected worker', async () => {
    const response = await handleWorkerAssignmentPush(ctx(baseRows(), { bookingIds: [BOOKING], reason: 'booking_dates_changed' }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.pushed).toBe(1);
    expect(payload.data.workers[0]).toMatchObject({ staffId: STAFF_A, status: 'synced' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/time-planning-adapter');
    expect((init.headers as Record<string, string>)['x-planning-service-proof']).toBeTruthy();
    const sent = JSON.parse(String(init.body));
    expect(sent.schema).toBe('time-planning-boundary.v1');
    expect(sent.operation).toBe('worker.assignments.sync');
    expect(sent.organizationId).toBe(ORG);
    expect(sent.personnelId).toBe(STAFF_A);
    // Hela projektionen skickas — Time behöver aldrig gissa vad som togs bort.
    expect(Array.isArray(sent.assignments)).toBe(true);
    expect(sent.assignments).toHaveLength(1);
    expect(sent.assignments[0].sourceVersion).toEqual(expect.any(String));
  });

  it('sends the complete (now empty) projection when the assignment was removed', async () => {
    const rows = baseRows();
    rows.staff_assignments = [];
    const response = await handleWorkerAssignmentPush(ctx(rows, { staffIds: [STAFF_A], reason: 'assignment_removed' }));
    expect(response.status).toBe(200);
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.assignments).toEqual([]);
  });

  it('rejects a push without any target', async () => {
    const response = await handleWorkerAssignmentPush(ctx(baseRows(), { reason: 'x' }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an upstream rejection per worker without throwing', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'import_rejected' }), { status: 409 }));
    const response = await handleWorkerAssignmentPush(ctx(baseRows(), { bookingIds: [BOOKING], reason: 'x' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.pushed).toBe(0);
    expect(payload.data.workers[0]).toMatchObject({ status: 'failed', code: 'import_rejected' });
  });
});

describe('mutation call sites trigger the push', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('wires the push operation in the boundary proxy with server-verified callers', () => {
    const index = read('supabase/functions/time-planning-proxy/index.ts');
    expect(index).toContain("operation === 'worker.assignments.push'");
    expect(index).toContain('x-planning-internal-key');
    expect(index).toContain('assertPlanningAccess');
  });

  it('notifies Time after booking field, date and staffing mutations', () => {
    expect(read('src/services/booking/liveBookingService.ts')).toContain('notifyTimeWorkerAssignments');
    expect(read('src/lib/calendar/phaseDaysWriter.ts')).toContain('notifyTimeWorkerAssignments');
    const staffing = read('src/services/staffAssignmentCore.ts');
    expect(staffing).toContain("reason: \"staff_assignment_changed\"");
    expect(staffing).toContain("reason: \"assignment_removed\"");
  });

  it('notifies Time after Booking-owned product/file changes land through the import', () => {
    const importer = read('supabase/functions/import-bookings/index.ts');
    expect(importer).toContain('notifyTimeWorkerAssignments');
    expect(importer).toContain("reason: 'booking_import_applied'");
  });
});
