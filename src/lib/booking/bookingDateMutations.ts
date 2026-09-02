/**
 * Rena hjälpfunktioner för datum-/tidsändringar på en bokning.
 *
 * Booking äger datumen. Planning skickar ALLTID hela den uppdaterade
 * arrayen till rätt kanoniskt fält — aldrig ett ensamt datum, som annars
 * skulle skriva över övriga datum i Booking.
 *
 * Tider skickas som rena HH:mm-värden; mappningen slår ihop dem till
 * Bookings textintervall rig_up_time / rig_down_time.
 */

import { EVENT_TIME_UNSUPPORTED_MESSAGE } from './canonicalBooking';

export type DatePhase = 'rig' | 'event' | 'rigDown';

export const DATE_FIELD_BY_PHASE: Record<DatePhase, 'rig_up_dates' | 'event_dates' | 'rig_down_dates'> = {
  rig: 'rig_up_dates',
  event: 'event_dates',
  rigDown: 'rig_down_dates',
};

export const TIME_FIELDS_BY_PHASE: Record<'rig' | 'rigDown', { start: string; end: string }> = {
  rig: { start: 'rig_start_time', end: 'rig_end_time' },
  rigDown: { start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

const uniqueSorted = (dates: string[]): string[] =>
  Array.from(new Set(dates.filter((d) => typeof d === 'string' && d.length > 0))).sort();

/** Normaliserar en tid till "HH:mm" eller null. Kastar vid ogiltigt format. */
export const normalizeClockTime = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error(`Ogiltig tid "${raw}" – förväntar HH:mm.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Ogiltig tid "${raw}" – förväntar HH:mm.`);
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
};

export interface DateMutationResult {
  dates: string[];
  payload: Record<string, unknown>;
}

/** Lägger till ett datum och returnerar HELA den uppdaterade arrayen. */
export const buildAddDatePayload = (
  phase: DatePhase,
  existing: string[],
  date: string,
): DateMutationResult => {
  const dates = uniqueSorted([...existing, date]);
  return { dates, payload: { [DATE_FIELD_BY_PHASE[phase]]: dates } };
};

/** Tar bort ett datum och skickar HELA den kvarvarande listan. */
export const buildRemoveDatePayload = (
  phase: DatePhase,
  existing: string[],
  date: string,
): DateMutationResult => {
  const dates = uniqueSorted(existing.filter((d) => d !== date));
  return { dates, payload: { [DATE_FIELD_BY_PHASE[phase]]: dates } };
};

/**
 * Byter ut ett datum (och eventuellt tid) och skickar hela arrayen.
 * Eventtider saknar kanonisk källa i Booking → fail-closed innan skrivning.
 */
export const buildEditDatePayload = (
  phase: DatePhase,
  existing: string[],
  oldDate: string,
  newDate: string,
  startTime?: string | null,
  endTime?: string | null,
): DateMutationResult => {
  const start = normalizeClockTime(startTime);
  const end = normalizeClockTime(endTime);

  if (phase === 'event' && (start || end)) {
    throw new Error(EVENT_TIME_UNSUPPORTED_MESSAGE);
  }

  const dates = uniqueSorted(existing.map((d) => (d === oldDate ? newDate : d)).concat(
    existing.includes(oldDate) ? [] : [newDate],
  ));

  const payload: Record<string, unknown> = { [DATE_FIELD_BY_PHASE[phase]]: dates };
  if (phase !== 'event') {
    const fields = TIME_FIELDS_BY_PHASE[phase];
    if (start !== null) payload[fields.start] = start;
    if (end !== null) payload[fields.end] = end;
  }
  return { dates, payload };
};
