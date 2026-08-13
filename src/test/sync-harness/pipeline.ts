/**
 * STEG 4A — testharness-pipeline för Booking → Planning-syncen.
 *
 * VIKTIGT: detta är INTE produktionslogik. Pipen komponerar de RIKTIGA
 * skyddsmodulerna (`_shared/*`) i samma ordning som `import-bookings` gör
 * (source contract → revision reserve/lease → canonical mutationer med
 * gates och felinsamling → commit endast vid 0 errors), så att
 * regressionstesterna kan verifiera besluten deterministiskt mot en
 * in-memory-databas utan produktionscredentials.
 */
import {
  parseSingleBookingSourceResponse,
} from '../../../supabase/functions/_shared/singleBookingSource';
import {
  reserveCanonicalRevision,
  commitCanonicalRevision,
  releaseCanonicalRevision,
  renewCanonicalRevisionLease,
  isOwnershipLostDecision,
} from '../../../supabase/functions/_shared/canonicalRevisionGuard';
import { deriveSingleBookingOutcome } from '../../../supabase/functions/_shared/singleBookingResult';
import {
  readProductSourceCompleteness,
  diffProducts,
} from '../../../supabase/functions/_shared/productCompleteness';
import {
  buildDatePresence,
  readDateSourceCompleteness,
  canMutateCalendar,
  canDeleteCanonicalDateEvent,
  type CalendarPhase,
} from '../../../supabase/functions/_shared/calendarSourceAuthority';
import {
  canMutateProjection,
  canDestroyProjection,
  buildProjectionPatch,
  hasProjectionChanges,
} from '../../../supabase/functions/_shared/projectionSourceAuthority';
import {
  createSyncCounters,
  guardedDeleteByIds,
  resolveDeleteRowIds,
  SafetyCircuitBreakerError,
  UnknownDestructiveRowCountError,
  resolveDryRun,
} from '../../../supabase/functions/_shared/syncObservability';
import type { FakeSupabase } from './fakeSupabase';

export interface RunResult {
  outcome: string;
  errors: { booking_id: string; error: string }[];
  committed: boolean;
  released: boolean;
  blockedRemovals: string[];
  deletedCalendarEventIds: string[];
  blockedCalendarDeletes: { id: string; reason: string }[];
  circuitBreakerTripped: boolean;
  dryRun: boolean;
  invalidDryRun: boolean;
  reason?: string;
  counters: ReturnType<typeof createSyncCounters>;
}

export interface RunOptions {
  organizationId: string;
  bookingId: string;
  /** Rå payload från Booking-modulen (single-läge). */
  payload: unknown;
  http?: { ok: boolean; status: number };
  jobId?: string;
  body?: Record<string, unknown>;
  /** Simulera att leasen tappas efter reserve men före mutationer. */
  loseLeaseBeforeMutations?: boolean;
  /** Simulera att projektläsningen misslyckas. */
  projectReadFails?: boolean;
}

const emptyResult = (over: Partial<RunResult>): RunResult => ({
  outcome: 'failed',
  errors: [],
  committed: false,
  released: false,
  blockedRemovals: [],
  deletedCalendarEventIds: [],
  blockedCalendarDeletes: [],
  circuitBreakerTripped: false,
  dryRun: false,
  invalidDryRun: false,
  counters: createSyncCounters(),
  ...over,
});

export async function runCanonicalSync(sb: FakeSupabase, opts: RunOptions): Promise<RunResult> {
  const counters = createSyncCounters();
  const orgId = opts.organizationId;
  const bookingId = opts.bookingId;
  const errors: { booking_id: string; error: string }[] = [];

  // 0. Dry-run fail-closed
  const dry = resolveDryRun(opts.body ?? undefined);
  if (dry.invalid) {
    return emptyResult({ outcome: 'failed', invalidDryRun: true, reason: dry.reason, counters });
  }

  // 1. Source contract
  const source = parseSingleBookingSourceResponse(opts.payload, { bookingId, organizationId: orgId }, opts.http);
  if (source.kind === 'error') {
    return emptyResult({ outcome: 'failed', reason: source.code, counters });
  }
  if (source.kind === 'absent') {
    // Normal sync gör ALDRIG destruktiv cancellation.
    return emptyResult({ outcome: 'not_found', reason: `absent:${source.reason}`, counters });
  }

  const booking = source.booking as Record<string, unknown>;
  const incoming = {
    sourceStatus: source.sourceStatus ?? undefined,
    sourceUpdatedAt: source.sourceUpdatedAt ?? undefined,
    sourceVersion: typeof booking.source_version === 'number' ? (booking.source_version as number) : undefined,
  };

  // 2. Revision + lease
  const reserved = await reserveCanonicalRevision(sb as any, {
    bookingId,
    organizationId: orgId,
    incoming,
    ownerJobId: opts.jobId ?? null,
  });
  if (!reserved.ok) {
    return emptyResult({
      outcome: reserved.decision === 'already_current' ? 'already_current' : 'failed',
      reason: reserved.decision,
      counters,
    });
  }
  if (reserved.decision === 'already_current') {
    return emptyResult({ outcome: 'already_current', reason: 'already_current', counters });
  }
  const token = reserved.reservationToken ?? null;

  // Dry-run: inga mutationer alls, släpp reservationen direkt.
  if (dry.dryRun) {
    await releaseCanonicalRevision(sb as any, { bookingId, organizationId: orgId, incoming, reservationToken: token });
    return emptyResult({ outcome: 'already_current', dryRun: true, released: true, counters });
  }

  if (opts.loseLeaseBeforeMutations) {
    // Ett annat jobb har tagit över: token stämmer inte längre.
    const rev = sb.db.revisions.find((r) => r.organization_id === orgId && r.booking_id === bookingId);
    if (rev) rev.reservation_token = 'other-job-token';
  }

  const renew = await renewCanonicalRevisionLease(sb as any, {
    bookingId,
    organizationId: orgId,
    incoming,
    reservationToken: token,
  });
  const leaseOwned = renew.ok;
  if (!leaseOwned) {
    return emptyResult({
      outcome: 'failed',
      reason: isOwnershipLostDecision(renew.decision) ? 'lease_ownership_lost' : renew.decision,
      counters,
    });
  }

  const ctxBase = { sourceFound: true, revisionValidated: true, leaseOwned: true };

  // 3. Canonical booking-fält (tenant-scopad update)
  const { error: bookingErr } = await sb
    .from('bookings')
    .update({
      status: booking.status ?? null,
      customer_name: booking.customer_name ?? null,
      rigdaydate: booking.rigdaydate ?? null,
      eventdate: booking.eventdate ?? null,
      rigdowndate: booking.rigdowndate ?? null,
    })
    .eq('id', bookingId)
    .eq('organization_id', orgId);
  if (bookingErr) errors.push({ booking_id: bookingId, error: `booking_update_failed:${bookingErr.message}` });

  // 4. Produkter
  const completeness = readProductSourceCompleteness(booking);
  const { data: existingProducts, error: prodReadErr } = await sb
    .from('booking_products')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);
  if (prodReadErr) errors.push({ booking_id: bookingId, error: `product_read_failed:${prodReadErr.message}` });

  const externalProducts = Array.isArray(booking.products) ? (booking.products as any[]) : [];
  const diff = diffProducts((existingProducts as any[]) ?? [], externalProducts, completeness);

  for (const name of diff.added) {
    const ext = externalProducts.find((p) => (p?.name ?? p?.product_name) === name);
    const { error: insErr } = await sb.from('booking_products').insert({
      organization_id: orgId,
      booking_id: bookingId,
      name,
      quantity: ext?.quantity ?? 1,
      unit_price: ext?.unit_price ?? 0,
      parent_product_id: null,
    });
    if (insErr) errors.push({ booking_id: bookingId, error: `product_insert_failed:${insErr.message}` });
  }

  // Parent-relationer för tillbehör (kräver egen mutation).
  const accessories = externalProducts.filter((p) => p?.parent_name);
  if (accessories.length > 0) {
    const { error: parentErr } = await sb
      .from('booking_products')
      .update({ parent_product_id: 'resolved-parent' })
      .eq('booking_id', bookingId)
      .eq('organization_id', orgId)
      .in('name', accessories.map((a) => a.name));
    if (parentErr) errors.push({ booking_id: bookingId, error: `product_parent_link_failed:${parentErr.message}` });
  }

  let circuitBreakerTripped = false;
  if (diff.removed.length > 0 && diff.deleteAllowed) {
    try {
      const ids = ((existingProducts as any[]) ?? [])
        .filter((p) => diff.removed.includes(p.name))
        .map((p) => p.id);
      const del = await guardedDeleteByIds(sb as any, {
        table: 'booking_products',
        ids,
        kind: 'product_deletes',
        counters,
        filters: { organization_id: orgId, booking_id: bookingId },
      });
      if (del.error) errors.push({ booking_id: bookingId, error: `product_delete_failed:${del.error}` });
    } catch (err) {
      if (err instanceof SafetyCircuitBreakerError) circuitBreakerTripped = true;
      errors.push({
        booking_id: bookingId,
        error: err instanceof UnknownDestructiveRowCountError ? 'unknown_destructive_row_count' : 'circuit_breaker',
      });
    }
  }

  // 5. Kalender
  const calCtx = {
    ...ctxBase,
    datesCompleteness: readDateSourceCompleteness(booking),
    datePresence: buildDatePresence(booking),
  };
  const deletedCalendarEventIds: string[] = [];
  const blockedCalendarDeletes: { id: string; reason: string }[] = [];
  const calGate = canMutateCalendar(calCtx);
  if (calGate.allowed) {
    const { data: events, error: calReadErr } = await sb
      .from('calendar_events')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('organization_id', orgId);
    if (calReadErr) {
      errors.push({ booking_id: bookingId, error: `calendar_read_failed:${calReadErr.message}` });
    } else {
      const canonicalDates: Record<CalendarPhase, string[]> = {
        rig: booking.rigdaydate ? [String(booking.rigdaydate)] : [],
        event: booking.eventdate ? [String(booking.eventdate)] : [],
        rigDown: booking.rigdowndate ? [String(booking.rigdowndate)] : [],
      } as Record<CalendarPhase, string[]>;
      for (const ev of (events as any[]) ?? []) {
        const gate = canDeleteCanonicalDateEvent(
          { ...ev, source_date: ev.date },
          calCtx,
          { bookingId, canonicalDates },
        );
        if (!gate.allowed) {
          blockedCalendarDeletes.push({ id: ev.id, reason: gate.reason });
          continue;
        }
        try {
          const ids = await resolveDeleteRowIds(sb as any, 'calendar_events', {
            id: ev.id,
            organization_id: orgId,
          });
          const del = await guardedDeleteByIds(sb as any, {
            table: 'calendar_events',
            ids,
            kind: 'calendar_deletes',
            counters,
            filters: { organization_id: orgId },
          });
          if (del.error) errors.push({ booking_id: bookingId, error: `calendar_delete_failed:${del.error}` });
          else deletedCalendarEventIds.push(ev.id);
        } catch (err) {
          if (err instanceof SafetyCircuitBreakerError) circuitBreakerTripped = true;
          errors.push({ booking_id: bookingId, error: 'calendar_delete_blocked' });
        }
      }
    }
  }

  // 6. Projection (projects/jobs/packing)
  const projCtx = { ...ctxBase, organizationId: orgId, bookingId };
  if (canMutateProjection(projCtx).allowed) {
    const projRead = opts.projectReadFails
      ? { data: null, error: { message: 'project_read_boom' } }
      : await sb.from('projects').select('*').eq('booking_id', bookingId).eq('organization_id', orgId);
    if (projRead.error) {
      errors.push({ booking_id: bookingId, error: `project_read_failed:${projRead.error.message}` });
    } else {
      const { patch } = buildProjectionPatch('projects', {
        name: booking.customer_name,
        status: undefined,
      });
      if (hasProjectionChanges(patch)) {
        const { error: projErr } = await sb
          .from('projects')
          .update(patch)
          .eq('booking_id', bookingId)
          .eq('organization_id', orgId);
        if (projErr) errors.push({ booking_id: bookingId, error: `project_update_failed:${projErr.message}` });
      }
    }
  }

  // Packing items för nya produkter (canonical).
  if (diff.added.length > 0) {
    const { data: packing } = await sb
      .from('packing_projects')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('organization_id', orgId);
    const packRow = ((packing as any[]) ?? [])[0];
    if (packRow) {
      for (const name of diff.added) {
        const { error: itemErr } = await sb.from('packing_list_items').insert({
          organization_id: orgId,
          packing_project_id: packRow.id,
          name,
          quantity: 1,
          packed_quantity: 0,
        });
        if (itemErr) errors.push({ booking_id: bookingId, error: `packing_item_insert_failed:${itemErr.message}` });
      }
    }
  }

  // Best-effort: notifieringar får misslyckas utan att importen blir partial.
  await sb.from('assistant_events').insert({ booking_id: bookingId, organization_id: orgId, type: 'sync_note' });

  // 7. Outcome + revision commit
  const results = {
    errors,
    failed: 0,
    updated_bookings: [bookingId],
    total: 1,
  };
  const outcome = deriveSingleBookingOutcome(results as any);

  let committed = false;
  let released = false;
  if (outcome === 'applied' || outcome === 'already_current') {
    const commit = await commitCanonicalRevision(sb as any, {
      bookingId,
      organizationId: orgId,
      incoming,
      reservationToken: token,
    });
    committed = commit.ok && commit.decision === 'applied';
    if (!committed) errors.push({ booking_id: bookingId, error: `commit_failed:${commit.decision}` });
  } else {
    const rel = await releaseCanonicalRevision(sb as any, {
      bookingId,
      organizationId: orgId,
      incoming,
      reservationToken: token,
    });
    released = rel.ok;
  }

  return {
    outcome: errors.length > 0 ? 'partial' : outcome,
    errors,
    committed,
    released,
    blockedRemovals: diff.blockedRemovals,
    deletedCalendarEventIds,
    blockedCalendarDeletes,
    circuitBreakerTripped,
    dryRun: false,
    invalidDryRun: false,
    counters,
  };
}

/** Hjälpare: normal sync får aldrig ta destruktiva projection-beslut. */
export const projectionDestructionGate = canDestroyProjection;
