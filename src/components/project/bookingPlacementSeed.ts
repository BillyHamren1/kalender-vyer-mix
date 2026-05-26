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
  rig: { start: '08:00', end: '12:00' },
  event: { start: '17:00', end: '23:00' },
  rigDown: { start: '08:00', end: '12:00' },
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

const fmtIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const nextDayIso = (iso: string): string => {
  try {
    return fmtIso(addDays(parseISO(iso), 1));
  } catch {
    return todayIso();
  }
};

export const prevDayIso = (iso: string): string => {
  try {
    return fmtIso(addDays(parseISO(iso), -1));
  } catch {
    return todayIso();
  }
};

/**
 * Bygger en ny extra rig- eller demonteringsdag att lägga till i wizarden.
 * - rig: defaultdatum = dagen FÖRE baseDate (en extra dag tidigare)
 * - rigDown: defaultdatum = dagen EFTER baseDate (en extra dag senare)
 */
export const makeExtraDay = (
  kind: 'rig' | 'rigDown',
  baseDate: string,
  teamId: string,
): PlanningDay => ({
  date: kind === 'rig' ? prevDayIso(baseDate) : nextDayIso(baseDate),
  kind,
  startTime: DEFAULTS[kind].start,
  endTime: DEFAULTS[kind].end,
  teamId,
});

/**
 * Sätter in en ny dag i listan och behåller kronologisk ordning (event sist
 * bland samma datum, så stepperns ordning blir naturlig).
 */
export const insertDaySorted = (days: PlanningDay[], day: PlanningDay): PlanningDay[] => {
  const next = [...days, day];
  const kindRank: Record<DayKind, number> = { rig: 0, event: 1, rigDown: 2 };
  next.sort((a, z) => {
    const c = a.date.localeCompare(z.date);
    if (c !== 0) return c;
    return kindRank[a.kind] - kindRank[z.kind];
  });
  return next;
};

/**
 * Tar bort en dag på given index. Event-dagen är skyddad — den filtreras
 * bort i wizarden ändå, men vi tillåter inte explicit borttagning av event.
 */
export const removeDayAt = (days: PlanningDay[], index: number): PlanningDay[] => {
  if (index < 0 || index >= days.length) return days;
  if (days[index].kind === 'event') return days;
  const next = [...days];
  next.splice(index, 1);
  return next;
};

/**
 * Returnerar true om bokningen saknar både rig- och rivdatum men har en eventdate.
 * Då är detta en ren leverans (utan rigg/riv) och ska placeras som leverans + retur
 * på samma dag i Lager-kolumnen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDeliveryOnlyBooking = (b: any): boolean =>
  !!b?.eventdate && !b?.rigdaydate && !b?.rigdowndate;

/**
 * Fallback-tidsslots för delivery-only-flödet.
 * Nr 1 = leverans (08–11), nr 2 = retur (12–15). Lätt att utöka med fler slots.
 */
export const DELIVERY_FALLBACK_SLOTS: Array<{ start: string; end: string }> = [
  { start: '08:00', end: '11:00' },
  { start: '12:00', end: '15:00' },
  { start: '16:00', end: '19:00' },
];

/**
 * Default team-id för Lager-kolumnen i planeringskalendern.
 * OBS: I planeringskalendern heter Lager-kolumnen `'transport'` (legacy-id).
 */
export const DELIVERY_DEFAULT_TEAM_ID = 'transport' as const;

/**
 * Bygger initial dag-lista från en bokning (rig + event + rigDown om datum finns),
 * sorterad kronologiskt. Användare kan plocka bort eventdagen i wizard.
 *
 * Special case — delivery-only: bokning utan rig/riv men med eventdate seedas som
 * ett rig-pass (leverans UT) + ett rigDown-pass (retur IN) på samma dag, med
 * sekventiella fallback-tider (08–11 + 12–15) och team `transport` (Lager).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const seedDaysFromBooking = (b: any, defaultTeamId = 'team-1'): PlanningDay[] => {
  // Delivery-only: skapa leverans + retur på eventdate i Lager-kolumnen
  if (isDeliveryOnlyBooking(b)) {
    const date = b.eventdate as string;
    const evStart = trimSec(b?.event_start_time);
    const evEnd = trimSec(b?.event_end_time);
    const slot1 = DELIVERY_FALLBACK_SLOTS[0];
    const slot2 = DELIVERY_FALLBACK_SLOTS[1];
    return [
      {
        date,
        kind: 'rig',
        startTime: evStart ?? slot1.start,
        endTime: evEnd ?? slot1.end,
        teamId: DELIVERY_DEFAULT_TEAM_ID,
      },
      {
        date,
        kind: 'rigDown',
        startTime: slot2.start,
        endTime: slot2.end,
        teamId: DELIVERY_DEFAULT_TEAM_ID,
      },
    ];
  }

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
    // Default: rigDown ärver tid/team från rig om bokningen inte har egna värden.
    const rig = list.find((d) => d.kind === 'rig');
    const hasOwnStart = !!trimSec(b?.rigdown_start_time);
    const hasOwnEnd = !!trimSec(b?.rigdown_end_time);
    list.push({
      date: b.rigdowndate,
      kind: 'rigDown',
      startTime: hasOwnStart ? pickBookingTime(b, 'rigDown', 'start') : (rig?.startTime ?? DEFAULTS.rigDown.start),
      endTime: hasOwnEnd ? pickBookingTime(b, 'rigDown', 'end') : (rig?.endTime ?? DEFAULTS.rigDown.end),
      teamId: rig?.teamId ?? defaultTeamId,
    });
  }

  list.sort((a, z) => a.date.localeCompare(z.date));
  return list;
};
