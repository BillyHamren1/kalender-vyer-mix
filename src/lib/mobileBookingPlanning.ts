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