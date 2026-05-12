// Deno-portable copy of src/lib/workday/plannedDay.ts.
// Pure, no I/O — duplicated here because Deno cannot import from src/.
// Keep the two files in sync; algorithm changes must be applied to both.

export const DEFAULT_GRACE_MINUTES = 30;

export interface BookingTimes {
  id?: string;
  eventdate?: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  rigdown_start_time?: string | null;
  rigdown_end_time?: string | null;
}

export interface PlannedDaySignals {
  plannedEndOfDay: string | null;
  hasMoreActivitiesToday: boolean;
  withinGracePeriod: boolean;
  drivingBookingId: string | null;
}

function toDate(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineDateTime(
  dateIso: string | null | undefined,
  timeStr: string | null | undefined,
): Date | null {
  if (!dateIso || !timeStr) return null;
  const datePart = dateIso.length >= 10 ? dateIso.slice(0, 10) : dateIso;
  const timePart = timeStr.length >= 5 ? timeStr.slice(0, 8) : timeStr;
  const iso = `${datePart}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function bookingLatestEnd(b: BookingTimes): Date | null {
  const candidates: Array<Date | null> = [
    combineDateTime(b.eventdate, b.event_end_time),
    combineDateTime(b.rigdowndate, b.rigdown_end_time),
    combineDateTime(b.rigdaydate, b.rig_end_time),
  ];
  let latest: Date | null = null;
  for (const c of candidates) {
    if (c && (!latest || c.getTime() > latest.getTime())) latest = c;
  }
  return latest;
}

function bookingEarliestStartAfter(b: BookingTimes, after: Date): Date | null {
  const candidates: Array<Date | null> = [
    combineDateTime(b.rigdaydate, b.rig_start_time),
    combineDateTime(b.eventdate, b.event_start_time),
    combineDateTime(b.rigdowndate, b.rigdown_start_time),
  ];
  let earliest: Date | null = null;
  for (const c of candidates) {
    if (c && c.getTime() > after.getTime()) {
      if (!earliest || c.getTime() < earliest.getTime()) earliest = c;
    }
  }
  return earliest;
}

function bookingTouchesDate(b: BookingTimes, ymd: string): boolean {
  const fields: Array<keyof BookingTimes> = ["eventdate", "rigdaydate", "rigdowndate"];
  for (const f of fields) {
    const v = b[f];
    if (typeof v === "string" && v.startsWith(ymd)) return true;
  }
  return false;
}

export function computePlannedDaySignals(
  bookings: BookingTimes[],
  nowInput: Date | string | number = new Date(),
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): PlannedDaySignals {
  const now = toDate(nowInput);
  const ymd = localYmd(now);

  let plannedEnd: Date | null = null;
  let drivingBookingId: string | null = null;
  let hasMore = false;

  for (const b of bookings) {
    if (!bookingTouchesDate(b, ymd)) continue;
    const end = bookingLatestEnd(b);
    if (end && (!plannedEnd || end.getTime() > plannedEnd.getTime())) {
      plannedEnd = end;
      drivingBookingId = b.id ?? null;
    }
    if (!hasMore) {
      const future = bookingEarliestStartAfter(b, now);
      if (future) hasMore = true;
    }
  }

  let withinGrace = false;
  if (plannedEnd) {
    const diffMs = Math.abs(now.getTime() - plannedEnd.getTime());
    withinGrace = diffMs <= graceMinutes * 60_000;
  }

  return {
    plannedEndOfDay: plannedEnd ? plannedEnd.toISOString() : null,
    hasMoreActivitiesToday: hasMore,
    withinGracePeriod: withinGrace,
    drivingBookingId,
  };
}
