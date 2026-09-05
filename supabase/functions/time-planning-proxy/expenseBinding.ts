/**
 * Binds Time expense snapshots to Planning's EXACT source records.
 *
 * Time carries `lineage.bookingRef` (= booking_number Planning exported) and
 * `lineage.projectRef` (= the `externalId` Planning exported: project id, or
 * booking id when the booking has no project). Every lookup is scoped to the
 * authenticated Planning tenant; a snapshot whose lineage cannot be resolved
 * inside that tenant is reported `unbound` and can never be decided.
 *
 * Read-only: no Planning source row is written.
 */

import type { ExpensePlanningBindingV1, ExpenseSubmissionV1 } from '../_shared/time-v2/expenseReviewV1.ts';

interface BookingRow {
  id: string;
  booking_number: string | null;
  title: string | null;
  assigned_project_id: string | null;
}
interface ProjectRow {
  id: string;
  name: string | null;
  booking_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const unbound = (reason: string): ExpensePlanningBindingV1 => ({
  status: 'unbound',
  bookingId: null,
  bookingNumber: null,
  bookingTitle: null,
  projectId: null,
  projectName: null,
  reason,
});

export interface BindingSources {
  bookingsByNumber: Map<string, BookingRow>;
  bookingsById: Map<string, BookingRow>;
  projectsById: Map<string, ProjectRow>;
}

/** One batched, org-scoped read for all lineage refs in the page. */
export async function loadBindingSources(
  admin: Admin,
  organizationId: string,
  submissions: readonly ExpenseSubmissionV1[],
): Promise<BindingSources> {
  const numbers = new Set<string>();
  const ids = new Set<string>();
  for (const s of submissions) {
    if (s.lineage.bookingRef) numbers.add(s.lineage.bookingRef);
    if (s.lineage.projectRef) {
      if (UUID_RE.test(s.lineage.projectRef)) ids.add(s.lineage.projectRef);
      // Non-UUID projectRef = Time repeating the booking reference.
      else numbers.add(s.lineage.projectRef);
    }
  }

  const bookingsByNumber = new Map<string, BookingRow>();
  const bookingsById = new Map<string, BookingRow>();
  const projectsById = new Map<string, ProjectRow>();

  if (numbers.size || ids.size) {
    let q = admin.from('bookings').select('id, booking_number, title, assigned_project_id').eq('organization_id', organizationId);
    const ors: string[] = [];
    if (numbers.size) ors.push(`booking_number.in.(${[...numbers].map((n) => `"${n.replace(/"/g, '')}"`).join(',')})`);
    if (ids.size) ors.push(`id.in.(${[...ids].join(',')})`);
    q = q.or(ors.join(','));
    const { data, error } = await q;
    if (error) throw new Error(`bookings read failed: ${error.message ?? 'unknown'}`);
    for (const b of (data ?? []) as BookingRow[]) {
      bookingsById.set(b.id, b);
      if (b.booking_number) bookingsByNumber.set(b.booking_number, b);
    }
  }
  if (ids.size) {
    const { data, error } = await admin
      .from('projects')
      .select('id, name, booking_id')
      .eq('organization_id', organizationId)
      .in('id', [...ids]);
    if (error) throw new Error(`projects read failed: ${error.message ?? 'unknown'}`);
    for (const p of (data ?? []) as ProjectRow[]) projectsById.set(p.id, p);
  }
  return { bookingsByNumber, bookingsById, projectsById };
}

/** Pure: resolves one snapshot against the loaded tenant sources. */
export function bindSubmission(s: ExpenseSubmissionV1, src: BindingSources): ExpensePlanningBindingV1 {
  const { bookingRef, projectRef } = s.lineage;
  if (!bookingRef && !projectRef) return unbound('lineage_missing');

  const booking = bookingRef ? src.bookingsByNumber.get(bookingRef) ?? null : null;
  const project = projectRef ? src.projectsById.get(projectRef) ?? null : null;
  // Time states `projectRef` as the exported `externalId`. When the booking has
  // no Planning project, Time repeats the booking reference there — either the
  // booking id or the booking number. Both must resolve to that same booking,
  // otherwise a legitimately bound booking is reported `project_not_in_tenant`
  // and its receipts/decisions stay locked forever.
  const bookingViaRef = !project && projectRef
    ? src.bookingsById.get(projectRef) ?? src.bookingsByNumber.get(projectRef) ?? null
    : null;

  if (bookingRef && !booking) return unbound('booking_not_in_tenant');
  if (projectRef && !project && !bookingViaRef) return unbound('project_not_in_tenant');


  const resolvedBooking = booking ?? bookingViaRef;
  if (booking && bookingViaRef && booking.id !== bookingViaRef.id) return unbound('binding_conflict');
  if (booking && project) {
    const agrees = project.booking_id === booking.id || booking.assigned_project_id === project.id;
    if (!agrees) return unbound('binding_conflict');
  }
  return {
    status: 'bound',
    bookingId: resolvedBooking?.id ?? null,
    bookingNumber: resolvedBooking?.booking_number ?? null,
    bookingTitle: resolvedBooking?.title ?? null,
    projectId: project?.id ?? resolvedBooking?.assigned_project_id ?? null,
    projectName: project?.name ?? null,
    reason: null,
  };
}
