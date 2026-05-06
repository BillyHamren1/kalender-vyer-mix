/**
 * Dev-only validation of derived staff calendar events.
 *
 * Detects splits / mis-grouping of large projects and logs actionable hints
 * under [staff-calendar-large-project-warning]. Production builds never run
 * this code — the caller gates it behind `import.meta.env.DEV`.
 */
import type { DerivedStaffEvent } from './deriveStaffEvents';

export interface ValidateInput {
  events: DerivedStaffEvent[];
  /** Map<bookingId, largeProjectId> from large_project_bookings (authoritative). */
  bookingToLargeProject: Map<string, string>;
  /** Optional: large_project_id → name, used to enrich warnings. */
  largeProjectNames?: Map<string, string>;
}

interface Warning {
  largeProjectId?: string;
  largeProjectName?: string;
  date?: string;
  phaseOrEventType?: string;
  teamOrResourceId?: string;
  visibleEventCount?: number;
  includedBookingIdsCount?: number;
  exampleEventTitles?: string[];
  exampleEventIds?: string[];
  recommendedCause: string;
}

export const validateLargeProjectGrouping = (input: ValidateInput): Warning[] => {
  const { events, bookingToLargeProject, largeProjectNames } = input;
  const warnings: Warning[] = [];

  // 1) Multiple visible events with same (lp, date, phase, team)
  const groupKey = new Map<string, DerivedStaffEvent[]>();
  for (const ev of events) {
    if (!ev.isLargeProject || !ev.largeProjectId) continue;
    const key = `${ev.staffId}|${ev.largeProjectId}|${ev.date}|${ev.phase}|${ev.teamId || ''}`;
    const arr = groupKey.get(key) || [];
    arr.push(ev);
    groupKey.set(key, arr);
  }
  for (const [, arr] of groupKey) {
    if (arr.length <= 1) continue;
    const sample = arr[0];
    warnings.push({
      largeProjectId: sample.largeProjectId,
      largeProjectName: sample.largeProjectName,
      date: sample.date,
      phaseOrEventType: sample.phase,
      teamOrResourceId: sample.teamId,
      visibleEventCount: arr.length,
      includedBookingIdsCount: sample.consolidatedBookingIds.length,
      exampleEventTitles: arr.slice(0, 3).map((e) => e.title),
      exampleEventIds: arr.slice(0, 3).map((e) => e.id),
      recommendedCause:
        'grouping key includes booking_id (multiple visible LP events for same date/phase/team)',
    });
  }

  // 2) Events with bookingId that should be LP but isLargeProject=false
  for (const ev of events) {
    if (ev.isLargeProject) continue;
    if (!ev.bookingId) continue;
    const lpId = bookingToLargeProject.get(ev.bookingId);
    if (!lpId) continue;
    warnings.push({
      largeProjectId: lpId,
      largeProjectName: largeProjectNames?.get(lpId),
      date: ev.date,
      phaseOrEventType: ev.phase,
      teamOrResourceId: ev.teamId,
      visibleEventCount: 1,
      includedBookingIdsCount: ev.consolidatedBookingIds.length,
      exampleEventTitles: [ev.title],
      exampleEventIds: [ev.id],
      recommendedCause: 'missing large_project_bookings lookup (booking is part of LP but rendered as normal)',
    });
  }

  // 3) LP events whose title still contains a booking_number
  for (const ev of events) {
    if (!ev.isLargeProject) continue;
    if (!ev.bookingNumber) continue;
    if (ev.title && ev.title.includes(ev.bookingNumber)) {
      warnings.push({
        largeProjectId: ev.largeProjectId,
        largeProjectName: ev.largeProjectName,
        date: ev.date,
        phaseOrEventType: ev.phase,
        teamOrResourceId: ev.teamId,
        visibleEventCount: 1,
        includedBookingIdsCount: ev.consolidatedBookingIds.length,
        exampleEventTitles: [ev.title],
        exampleEventIds: [ev.id],
        recommendedCause: 'title builder uses booking title/number instead of large project name',
      });
    }
  }

  // 4) LP events missing consolidatedBookingIds while >1 booking exists in lpb for that LP
  const lpBookingsCount = new Map<string, number>();
  for (const [, lpId] of bookingToLargeProject) {
    lpBookingsCount.set(lpId, (lpBookingsCount.get(lpId) || 0) + 1);
  }
  for (const ev of events) {
    if (!ev.isLargeProject || !ev.largeProjectId) continue;
    const expected = lpBookingsCount.get(ev.largeProjectId) || 0;
    if (expected > 1 && ev.consolidatedBookingIds.length <= 1) {
      warnings.push({
        largeProjectId: ev.largeProjectId,
        largeProjectName: ev.largeProjectName,
        date: ev.date,
        phaseOrEventType: ev.phase,
        teamOrResourceId: ev.teamId,
        visibleEventCount: 1,
        includedBookingIdsCount: ev.consolidatedBookingIds.length,
        exampleEventTitles: [ev.title],
        exampleEventIds: [ev.id],
        recommendedCause:
          'consolidatedBookingIds missing — derivation only attached one booking even though LP has many sub-bookings',
      });
    }
  }

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[staff-calendar-large-project-warning]', {
      total: warnings.length,
      warnings,
    });
  }

  return warnings;
};
