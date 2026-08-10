/**
 * STEG 3E – Säker datum-, tids- och kalendersync (Booking → Planning).
 *
 * Ren TypeScript (inga Deno-API:er) så modulen kan enhetstestas från vitest
 * och importeras av edge functions.
 *
 * GRUNDREGLER
 *  1. OWNERSHIP: endast Booking-ägda datum-/tidsfält får styra Booking-genererade
 *     kalenderhändelser. Planning-only-events (activity/task/planning) rörs aldrig.
 *  2. Ingen kalendermutation utan validerat kontrakt + validerad revision + lease.
 *  3. Delete av ett Booking-genererat event kräver: found:true, nyare revision,
 *     canonical + komplett datumfält, samt att datumet uttryckligen saknas.
 *  4. Saknat fält (absent) ≠ tom lista ([]). Absent får ALDRIG rensa datum.
 *  5. Reconcile är idempotent på (booking + event_type + canonical date).
 */

export const CALENDAR_DESTRUCTIVE_BLOCKED_LOG = 'calendar_destructive_sync_blocked';
export const CALENDAR_MUTATION_BLOCKED_LOG = 'calendar_mutation_blocked';

/** Canonical Booking-ägda datumfält (arrayer) i källkontraktet. */
export const BOOKING_OWNED_DATE_FIELDS = {
  rig: ['rig_up_dates', 'rigdaydate', 'rig_up_date', 'rig_date'],
  event: ['event_dates', 'eventdate', 'event_date'],
  rigDown: ['rig_down_dates', 'rigdowndate', 'rig_down_date'],
} as const;

/** Canonical Booking-ägda tidsfält. */
export const BOOKING_OWNED_TIME_FIELDS = [
  'rig_start_time', 'rig_end_time',
  'event_start_time', 'event_end_time',
  'rigdown_start_time', 'rigdown_end_time',
] as const;

/** Event-typer som Booking-sync äger (får skapas/uppdateras/raderas av sync). */
export const BOOKING_OWNED_EVENT_TYPES = ['rig', 'event', 'rigDown'] as const;

/** Event-typer som ALLTID är Planning-ägda och aldrig får röras av sync. */
export const PLANNING_ONLY_EVENT_TYPES = [
  'activity', 'task', 'todo', 'custom', 'internal', 'manual', 'note', 'absence',
] as const;

export type CalendarPhase = keyof typeof BOOKING_OWNED_DATE_FIELDS;
export type FieldPresence = 'absent' | 'empty' | 'present';
export type DateSourceCompleteness = 'complete' | 'incomplete' | 'unknown';

export interface CalendarEventRow {
  id?: string;
  event_type?: string | null;
  source_date?: string | null;
  start_time?: string | null;
  booking_id?: string | null;
  times_locked?: boolean | null;
  created_by?: string | null;
  source?: string | null;
}

/**
 * Läser presence för ett canonical datumfält.
 *  - 'absent'  → fältet finns inte i svaret (får aldrig rensa)
 *  - 'empty'   → fältet finns men är tom lista/null-sträng (kan rensa OM complete)
 *  - 'present' → fältet innehåller minst ett datum
 */
export function readDateFieldPresence(source: unknown, phase: CalendarPhase): FieldPresence {
  if (!source || typeof source !== 'object') return 'absent';
  const root = source as Record<string, unknown>;
  const keys = BOOKING_OWNED_DATE_FIELDS[phase];
  let sawField = false;
  for (const key of keys) {
    if (!(key in root)) continue;
    const value = root[key];
    if (value === undefined) continue;
    sawField = true;
    if (Array.isArray(value)) {
      if (value.filter((v) => typeof v === 'string' && v.trim() !== '').length > 0) return 'present';
      continue;
    }
    if (typeof value === 'string' && value.trim() !== '') return 'present';
  }
  return sawField ? 'empty' : 'absent';
}

/** Läser explicit completeness-flagga för datum ur kontraktet (fail-closed). */
export function readDateSourceCompleteness(source: unknown): DateSourceCompleteness {
  if (!source || typeof source !== 'object') return 'unknown';
  const root = source as Record<string, unknown>;
  const candidates: unknown[] = [root.dates_complete, root.calendar_complete];
  const meta = root.meta;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    candidates.push(m.dates_complete, m.calendar_complete);
  }
  for (const value of candidates) {
    if (value === true) return 'complete';
    if (value === false) return 'incomplete';
  }
  return 'unknown';
}

/**
 * Är eventet bevisligen Booking-genererat?
 * Endast Booking-ägda event_types kopplade till en booking_id räknas.
 * Allt annat (activity/task/planning-only, saknad booking_id) bevaras.
 */
export function isBookingGeneratedEvent(event: CalendarEventRow, bookingId?: string): boolean {
  const type = (event?.event_type ?? '').toString();
  if (!type) return false;
  if ((PLANNING_ONLY_EVENT_TYPES as readonly string[]).includes(type)) return false;
  if (!(BOOKING_OWNED_EVENT_TYPES as readonly string[]).includes(type)) return false;
  const src = (event?.source ?? '').toString().toLowerCase();
  if (src && src !== 'booking' && src !== 'booking_import' && src !== 'import') return false;
  if (!event?.booking_id && bookingId) return true; // rad hämtad via booking-filter
  if (bookingId && event?.booking_id && event.booking_id !== bookingId) return false;
  return true;
}

/** Canonical datum för en kalenderrad (source_date är auktoritet). */
export function eventCanonicalDate(event: CalendarEventRow): string {
  const sd = (event?.source_date ?? '').toString();
  if (sd) return sd.slice(0, 10);
  const st = (event?.start_time ?? '').toString();
  return st ? st.slice(0, 10) : '';
}

export interface CalendarSyncContext {
  /** Kontraktet validerat och found:true (inte local fallback/not_found/fel). */
  sourceFound: boolean;
  /** Inkommande revision validerad (inte stale/conflict/invalid). */
  revisionValidated: boolean;
  /** Leasen ägs av denna körning. */
  leaseOwned: boolean;
  /** Explicit completeness för datumfälten. */
  datesCompleteness: DateSourceCompleteness;
  /** Presence per fas i den canonical responsen. */
  datePresence: Record<CalendarPhase, FieldPresence>;
  /** Tekniskt fel någonstans i hämtning/parse av datumdata. */
  hadSourceError?: boolean;
  /**
   * Lokal recovery-väg (ingen canonical källa): icke-destruktiv create/update
   * från Plannings egna auktoritativa bokningsrad är tillåten, delete aldrig.
   */
  localAuthority?: boolean;
}

export interface GateResult {
  allowed: boolean;
  reason: string;
}

/** Får kalendern muteras (create/update) överhuvudtaget? */
export function canMutateCalendar(ctx: CalendarSyncContext): GateResult {
  if (ctx.hadSourceError) return { allowed: false, reason: 'source_error' };
  if (ctx.sourceFound) {
    if (!ctx.revisionValidated) return { allowed: false, reason: 'invalid_or_stale_source_revision' };
    if (!ctx.leaseOwned) return { allowed: false, reason: 'lease_not_owned' };
    return { allowed: true, reason: 'ok' };
  }
  if (ctx.localAuthority) return { allowed: true, reason: 'local_authority_non_destructive' };
  return { allowed: false, reason: 'source_not_found_or_fallback' };
}

/**
 * Får ett specifikt Booking-genererat event raderas som "canonical date removed"?
 * Fail-closed på alla osäkerheter.
 */
export function canDeleteCanonicalDateEvent(
  event: CalendarEventRow,
  ctx: CalendarSyncContext,
  opts: { bookingId?: string; canonicalDates: Record<CalendarPhase, string[]> },
): GateResult {
  if (ctx.hadSourceError) return { allowed: false, reason: 'source_error' };
  if (!ctx.sourceFound) return { allowed: false, reason: 'source_not_found_or_fallback' };
  if (!ctx.revisionValidated) return { allowed: false, reason: 'invalid_or_stale_source_revision' };
  if (!ctx.leaseOwned) return { allowed: false, reason: 'lease_not_owned' };


  if (!isBookingGeneratedEvent(event, opts.bookingId)) {
    return { allowed: false, reason: 'not_booking_generated' };
  }
  if (event.times_locked === true) return { allowed: false, reason: 'times_locked' };

  const phase = (event.event_type ?? '') as CalendarPhase;
  if (!(phase in BOOKING_OWNED_DATE_FIELDS)) return { allowed: false, reason: 'unknown_phase' };

  const presence = ctx.datePresence[phase];
  if (presence === 'absent') return { allowed: false, reason: 'date_field_absent' };
  if (ctx.datesCompleteness !== 'complete') {
    return { allowed: false, reason: 'dates_not_verified_complete' };
  }

  const date = eventCanonicalDate(event);
  if (!date) return { allowed: false, reason: 'event_without_canonical_date' };
  const canonical = opts.canonicalDates[phase] || [];
  if (canonical.includes(date)) return { allowed: false, reason: 'date_still_canonical' };

  return { allowed: true, reason: 'canonical_date_removed' };
}

/** Idempotens: en desired-rad per (event_type|date). */
export function dedupeDesiredEvents<T extends { event_type: string; date: string }>(desired: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of desired) {
    const key = `${d.event_type}|${d.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Hjälpare: bygg presence-map från canonical källa. */
export function buildDatePresence(source: unknown): Record<CalendarPhase, FieldPresence> {
  return {
    rig: readDateFieldPresence(source, 'rig'),
    event: readDateFieldPresence(source, 'event'),
    rigDown: readDateFieldPresence(source, 'rigDown'),
  };
}

/** Kontext som blockerar allt destruktivt (local fallback / okänd källa). */
export function fallbackCalendarContext(): CalendarSyncContext {
  return {
    sourceFound: false,
    revisionValidated: false,
    leaseOwned: false,
    localAuthority: true,
    datesCompleteness: 'unknown',
    datePresence: { rig: 'absent', event: 'absent', rigDown: 'absent' },
  };
}
