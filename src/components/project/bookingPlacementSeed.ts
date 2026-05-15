import { addDays, parseISO } from 'date-fns';

export type Phase = 'rig' | 'rigDown';
export type DayKind = Phase | 'event';

export interface PlanningDay {
  date: string;
  kind: DayKind;
  startTime: string;
  endTime: string;
  teamId: string;
}

export const DEFAULTS: Record<DayKind, { start: string; end: string }> = {
  rig: { start: '08:00', end: '16:00' },
  event: { start: '17:00', end: '23:00' },
  rigDown: { start: '08:00', end: '16:00' },
};

export const PHASE_ORDER: DayKind[] = ['rig', 'event', 'rigDown'];

export const phaseLabel = (k: DayKind) =>
  k === 'rig' ? 'Riggning' : k === 'rigDown' ? 'Demontering' : 'Event';

export const FIELD_MAP: Record<DayKind, { start: string; end: string; lock: string }> = {
  rig: { start: 'rig_start_time', end: 'rig_end_time', lock: 'rig_time_locked' },
  event: { start: 'event_start_time', end: 'event_end_time', lock: 'event_time_locked' },
  rigDown: { start: 'rigdown_start_time', end: 'rigdown_end_time', lock: 'rigdown_time_locked' },
};

/**
 * Plockar HH:MM ur ett tidsfält som kan vara antingen
 *   - "HH:MM" / "HH:MM:SS"
 *   - "YYYY-MM-DD HH:MM:SS+TZ" eller ISO ("…THH:MM…")
 */
export const trimSec = (t: string | null | undefined): string | null => {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/(?:^|[T\s])(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pickBookingTime = (booking: any, kind: DayKind, edge: 'start' | 'end'): string => {
  const field = FIELD_MAP[kind][edge];
  return trimSec(booking?.[field]) ?? DEFAULTS[kind][edge];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isPhaseLocked = (booking: any, kind: DayKind): boolean =>
  booking?.[FIELD_MAP[kind].lock] === true;

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const nextDayIso = (iso: string): string => {
  try {
    const d = addDays(parseISO(iso), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return todayIso();
  }
};

/**
 * Bygger initial dag-lista från en bokning (rig + event + rigDown om datum finns),
 * sorterad kronologiskt. Användare kan plocka bort eventdagen i wizard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const seedDaysFromBooking = (b: any, defaultTeamId = 'team-1'): PlanningDay[] => {
  const list: PlanningDay[] = [];
  if (b?.rigdaydate) {
    list.push({
      date: b.rigdaydate,
      kind: 'rig',
      startTime: pickBookingTime(b, 'rig', 'start'),
      endTime: pickBookingTime(b, 'rig', 'end'),
      teamId: defaultTeamId,
    });
  }
  if (b?.eventdate) {
    list.push({
      date: b.eventdate,
      kind: 'event',
      startTime: pickBookingTime(b, 'event', 'start'),
      endTime: pickBookingTime(b, 'event', 'end'),
      teamId: defaultTeamId,
    });
  }
  if (b?.rigdowndate) {
    list.push({
      date: b.rigdowndate,
      kind: 'rigDown',
      startTime: pickBookingTime(b, 'rigDown', 'start'),
      endTime: pickBookingTime(b, 'rigDown', 'end'),
      teamId: defaultTeamId,
    });
  }
  list.sort((a, z) => a.date.localeCompare(z.date));
  return list;
};
