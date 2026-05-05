import type { ArrivalTarget } from '@/types/arrivalTarget';
import type { MobileBooking } from '@/services/mobileApiService';

const normalizeAssignmentDates = (booking: MobileBooking): string[] => {
  if (!Array.isArray(booking.assignment_dates)) return [];

  return booking.assignment_dates
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && 'date' in value) {
        const dateValue = (value as { date?: unknown }).date;
        return typeof dateValue === 'string' ? dateValue : null;
      }
      return null;
    })
    .filter((value): value is string => !!value);
};

export const getLocalIsoDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function isBookingPlannedOnDate(booking: MobileBooking, isoDate = getLocalIsoDate()): boolean {
  const candidates = [
    booking.rigdaydate,
    booking.eventdate,
    booking.rigdowndate,
    ...normalizeAssignmentDates(booking),
  ];

  return candidates.some((value) => value === isoDate);
}

export function isArrivalTargetPlannedToday(
  target: ArrivalTarget,
  bookings: MobileBooking[],
  isoDate = getLocalIsoDate(),
): boolean {
  if (target.kind === 'location') return true;

  if (target.kind === 'booking') {
    return bookings.some((booking) => booking.id === target.target_id && isBookingPlannedOnDate(booking, isoDate));
  }

  if (target.kind === 'project') {
    return bookings.some((booking) => booking.large_project_id === target.target_id && isBookingPlannedOnDate(booking, isoDate));
  }

  return false;
}

/**
 * Return earliest planned start (rig/event/rigdown) across today's bookings.
 * Used by the mobile assistant to detect "late_after_planned_start" — i.e.
 * the user was scheduled from 08:00 but app got first signal at 13:10.
 *
 * Pure: takes bookings + date and returns ISO + a human-readable label.
 * Returns null if no booking has both a date matching today AND a start time.
 */
export function getEarliestPlannedStartToday(
  bookings: MobileBooking[],
  isoDate = getLocalIsoDate(),
): { iso: string; label: string } | null {
  let bestMs = Infinity;
  let bestIso: string | null = null;
  let bestLabel = '';

  const consider = (
    dateStr: string | null,
    timeStr: string | null,
    label: string,
  ) => {
    if (!dateStr || !timeStr) return;
    if (dateStr !== isoDate) return;
    // timeStr looks like "HH:MM:SS" or "HH:MM" — combine with local date.
    const hhmm = timeStr.length >= 5 ? timeStr.slice(0, 5) : timeStr;
    const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const [yy, mm, dd] = dateStr.split('-').map((v) => parseInt(v, 10));
    const local = new Date(yy, (mm || 1) - 1, dd || 1, h, m, 0, 0);
    const ms = local.getTime();
    if (ms < bestMs) {
      bestMs = ms;
      bestIso = local.toISOString();
      bestLabel = label;
    }
  };

  for (const b of bookings) {
    const name = b.large_project_name || b.client || 'Planerad aktivitet';
    consider(b.rigdaydate, b.rig_start_time, `${name} (rigg)`);
    consider(b.eventdate, b.event_start_time, name);
    consider(b.rigdowndate, b.rigdown_start_time, `${name} (rigdown)`);
  }

  return bestIso ? { iso: bestIso, label: bestLabel } : null;
}