// Canonical source-change detection for Booking → Planning calendar reconcile.
// Pure helpers (Deno + Vitest). "Fast tid" (times_locked) protects manual
// drag/edit, NOT a newer validated canonical source change. A time is only
// rewritten when the SOURCE value (<phase>_*_time_external) actually changed
// between the previously applied booking row and the incoming one; unrelated
// imports never overwrite local adjustments.
import {
  isBookingGeneratedEvent,
  type CalendarEventRow,
  type CalendarSyncContext,
} from './calendarSourceAuthority.ts';

export type MovablePhase = 'rig' | 'rigDown';

const FIELDS: Record<MovablePhase, { date: string; start: string; end: string }> = {
  rig: { date: 'rigdaydate', start: 'rig_start_time_external', end: 'rig_end_time_external' },
  rigDown: { date: 'rigdowndate', start: 'rigdown_start_time_external', end: 'rigdown_end_time_external' },
};

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})?[T ]?(\d{2}:\d{2})(:\d{2})?/);
  if (m) return `${m[1] ?? ''}T${m[2]}${m[3] ?? ':00'}`;
  return s;
};

export interface PhaseSourceChange {
  /** false = no previous applied row → caller keeps legacy behaviour. */
  known: boolean;
  dateChanged: boolean;
  prevDate: string | null;
  nextDate: string | null;
  /** Explicit incoming source time differs from the previously applied source time. */
  timeChanged: boolean;
}

export function detectPhaseSourceChange(prev: any, next: any, phase: MovablePhase): PhaseSourceChange {
  const f = FIELDS[phase];
  const nextDate = (next?.[f.date] as string | null) || null;
  if (!prev) return { known: false, dateChanged: false, prevDate: null, nextDate, timeChanged: false };
  const prevDate = (prev[f.date] as string | null) || null;
  const ns = norm(next?.[f.start]);
  const ne = norm(next?.[f.end]);
  // Missing/empty incoming time is never a "change" (no blanking from empty source).
  const timeChanged = (ns !== null && ns !== norm(prev[f.start])) || (ne !== null && ne !== norm(prev[f.end]));
  return {
    known: true,
    dateChanged: !!prevDate && !!nextDate && prevDate !== nextDate,
    prevDate,
    nextDate,
    timeChanged,
  };
}

export type TimeUpdateDecision = 'update' | 'skip_same' | 'skip_default' | 'skip_locked' | 'skip_local_unchanged_source';

export function decideExistingTimeUpdate(i: {
  rowLocked: boolean;
  desiredExplicitStart: boolean;
  timesDiffer: boolean;
  source: Pick<PhaseSourceChange, 'known' | 'timeChanged'>;
}): TimeUpdateDecision {
  if (!i.timesDiffer) return 'skip_same';
  if (!i.desiredExplicitStart) return 'skip_default';
  if (i.source.known && i.source.timeChanged) return 'update'; // newer canonical wins, even when locked
  if (i.rowLocked) return 'skip_locked';
  if (i.source.known) return 'skip_local_unchanged_source';
  return 'update'; // legacy path (no previous applied row)
}

export interface DateMove<E> { event: E; fromDate: string; toDate: string }

/**
 * Deterministic date moves for one phase: Booking-generated rows on a
 * previously canonical date that is no longer canonical are moved (same row,
 * same resource_id/team, same lock flag) onto newly canonical dates that have
 * no row yet. Pairing is sorted old↔new; extras fall back to the normal
 * insert/keep paths so no planning is silently lost.
 */
export function planDateMoves<E extends CalendarEventRow & { id: string }>(i: {
  phase: MovablePhase;
  existing: E[];
  desiredDates: string[];
  prevCanonicalDates: string[];
  bookingId: string;
  ctx: CalendarSyncContext;
}): DateMove<E>[] {
  const c = i.ctx;
  if (c.hadSourceError || !c.sourceFound || !c.revisionValidated || !c.leaseOwned) return [];
  // En flytt behåller raden (id/team/lås) och är inte destruktiv: kräver
  // att fasens datum finns i källan och att källan inte uttryckligen är
  // ofullständig. Sales skickar inget dates_complete-fält, så 'unknown'
  // räcker här (radering kräver fortfarande 'complete').
  if (c.datesCompleteness === 'incomplete' || c.datePresence[i.phase] !== 'present') return [];
  const desired = new Set(i.desiredDates);
  const dateOf = (e: E) => (e.source_date as string | null) || (e.start_time as string | null)?.slice(0, 10) || '';
  const phaseRows = i.existing.filter((e) => e.event_type === i.phase);
  const occupied = new Set(phaseRows.map(dateOf));
  const removed = new Set(i.prevCanonicalDates.filter((d) => d && !desired.has(d)));
  const from = phaseRows
    .filter((e) => removed.has(dateOf(e)) && isBookingGeneratedEvent(e, i.bookingId))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || String(a.id).localeCompare(String(b.id)));
  const to = [...desired].filter((d) => !occupied.has(d)).sort();
  const n = Math.min(from.length, to.length);
  return Array.from({ length: n }, (_, k) => ({ event: from[k], fromDate: dateOf(from[k]), toDate: to[k] }));
}

/** Shift an ISO timestamp by whole days (keeps local time-of-day under the +00:00 convention). */
export function shiftIsoByDays(iso: string, fromDate: string, toDate: string): string {
  const delta = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`);
  return new Date(Date.parse(iso) + delta).toISOString().replace('.000Z', '+00:00');
}

// ── DURABLE PER-ROW SOURCE CHECKPOINT ──────────────────────────────────────
// calendar_events.source_start_time/source_end_time = the canonical explicit
// Booking time last APPLIED to that row (source_date is the date checkpoint).
// Comparing the incoming source with the row's own checkpoint (instead of
// with the already-saved bookings row) makes a retry after "booking saved,
// calendar failed" still see the change, while a local edit after a fully
// applied import is preserved (checkpoint == incoming source → no change).

export interface SourceCheckpoint { startMs: number | null; endMs: number | null }

const ms = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

/** null = row has no checkpoint (legacy row or locally created day). */
export function readSourceCheckpoint(ev: any): SourceCheckpoint | null {
  const s = ms(ev?.source_start_time);
  const e = ms(ev?.source_end_time);
  if (s === null && e === null) return null;
  return { startMs: s, endMs: e };
}

export function resolveRowSourceChange(i: {
  desiredExplicitStart: boolean;
  desiredStart: string | null;
  desiredEnd: string | null;
  checkpoint: SourceCheckpoint | null;
  legacy: Pick<PhaseSourceChange, 'known' | 'timeChanged'>;
}): Pick<PhaseSourceChange, 'known' | 'timeChanged'> {
  if (!i.checkpoint) return i.legacy;
  if (!i.desiredExplicitStart) return { known: true, timeChanged: false };
  const s = ms(i.desiredStart), e = ms(i.desiredEnd);
  return {
    known: true,
    timeChanged: (s !== null && s !== i.checkpoint.startMs) || (e !== null && e !== i.checkpoint.endMs),
  };
}

/** True when the row's checkpoint must be (re)written to match the desired explicit source. */
export function checkpointNeedsWrite(desiredExplicitStart: boolean, desiredStart: string | null, desiredEnd: string | null, cp: SourceCheckpoint | null): boolean {
  if (!desiredExplicitStart) return false;
  return !cp || cp.startMs !== ms(desiredStart) || cp.endMs !== ms(desiredEnd);
}

/**
 * Canonical dates left behind by checkpointed (= import-written) Booking rows.
 * Rows without checkpoint (legacy or locally added extra days) are never
 * treated as move sources here; the legacy booking-row diff still covers them.
 */
export function checkpointedAbandonedDates(existing: any[], phase: MovablePhase, desiredDates: string[], bookingId: string): string[] {
  const desired = new Set(desiredDates);
  const out = new Set<string>();
  for (const e of existing || []) {
    if (e?.event_type !== phase || !readSourceCheckpoint(e) || !isBookingGeneratedEvent(e, bookingId)) continue;
    const d = (e.source_date as string | null) || (e.start_time as string | null)?.slice(0, 10) || '';
    if (d && !desired.has(d)) out.add(d);
  }
  return [...out].sort();
}
