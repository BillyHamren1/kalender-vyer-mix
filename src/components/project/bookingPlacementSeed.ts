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
 * Returnerar true om bokningen är "endast uthyrning/leverans".
 * Sanningskälla: `rental_only`-flaggan från externa bokningssystemets webhook
 * (booking.updated / booking.confirmed osv.). När flaggan är true ska INGA
 * rigg-upp/rigg-ner-uppgifter planeras — bara leverans UT + retur IN i Lager.
 *
 * Datumheuristik används INTE. Om flaggan saknas tolkas bokningen som vanlig.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDeliveryOnlyBooking = (b: any): boolean =>
  b?.rental_only === true;

/**
 * Fallback-tidsslots för delivery-only-flödet (när bokningen saknar egna tider).
 * Slot 0 = leverans UT (08–11), slot 1 = retur IN (12–15).
 * Om UT och IN ligger på SAMMA dag används slot 0 + slot 1.
 * Om de ligger på olika dagar används slot 0 (08–11) för båda.
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
 * Special case — `rental_only === true` (leverans): inget event/rigg planeras.
 * Vi tolkar då bokningens datum som:
 *   - rigdaydate   = Leverans UT  (rig-pass, Lager)
 *   - rigdowndate  = Retur IN     (rigDown-pass, Lager)
 *   - eventdate    = själva eventet hos kund — hoppas över i planeringen
 * Om varken rigdaydate eller rigdowndate finns används eventdate för båda
 * passen (UT 08–11, IN 12–15 fallback). Om bara ett av rig/rigdown saknas,
 * faller det tillbaka till motsvarande närmaste datum (rigdate → rigdowndate
 * eller eventdate).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const seedDaysFromBooking = (b: any, defaultTeamId = 'team-1'): PlanningDay[] => {
  // === Rental-only (leverans) — rig=UT, rigdown=IN, alltid i Lager ===
  if (isDeliveryOnlyBooking(b)) {
    const slot0 = DELIVERY_FALLBACK_SLOTS[0]; // 08–11
    const slot1 = DELIVERY_FALLBACK_SLOTS[1]; // 12–15

    const outDate: string | null =
      (b?.rigdaydate as string | undefined) ??
      (b?.eventdate as string | undefined) ??
      null;
    const inDate: string | null =
      (b?.rigdowndate as string | undefined) ??
      (b?.eventdate as string | undefined) ??
      null;

    const list: PlanningDay[] = [];
    if (outDate) {
      const sameDay = inDate === outDate;
      list.push({
        date: outDate,
        kind: 'rig', // Leverans UT
        startTime: trimSec(b?.rig_start_time) ?? slot0.start,
        endTime: trimSec(b?.rig_end_time) ?? slot0.end,
        teamId: DELIVERY_DEFAULT_TEAM_ID,
      });
      if (inDate) {
        list.push({
          date: inDate,
          kind: 'rigDown', // Retur IN
          startTime: trimSec(b?.rigdown_start_time) ?? (sameDay ? slot1.start : slot0.start),
          endTime: trimSec(b?.rigdown_end_time) ?? (sameDay ? slot1.end : slot0.end),
          teamId: DELIVERY_DEFAULT_TEAM_ID,
        });
      }
    } else if (inDate) {
      // Bara retur-datum
      list.push({
        date: inDate,
        kind: 'rigDown',
        startTime: trimSec(b?.rigdown_start_time) ?? slot0.start,
        endTime: trimSec(b?.rigdown_end_time) ?? slot0.end,
        teamId: DELIVERY_DEFAULT_TEAM_ID,
      });
    }
    list.sort((a, z) => a.date.localeCompare(z.date));
    return list;
  }

  // === Vanlig bokning ===
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
