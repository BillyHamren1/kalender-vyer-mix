import type { DaySegment, SegmentType } from './dayPartition';

export type LastPingReasonKind =
  | 'home_end_of_day'
  | 'work_ended_quiet'
  | 'travel_cutoff'
  | 'signal_lost'
  | 'battery_or_app_closed'
  | 'normal_end_of_day'
  | 'unknown';

export interface LastPingReason {
  kind: LastPingReasonKind;
  /** Kort förklaring som visas i UI:t. */
  text: string;
  /** Om det är en avvikelse värd en varningstriangel. */
  warn: boolean;
}

/**
 * Heuristisk gissning för varför ping-strömmen tystnar efter sista blocket.
 * Ren funktion — ingen DB, inga sidoeffekter. Används av StaffGpsDayRow.
 */
export function inferLastPingReason(
  lastSegment: DaySegment | null | undefined,
  lastIso: string | null | undefined,
  staffName?: string | null,
): LastPingReason | null {
  if (!lastSegment || !lastIso) return null;

  const who = staffName?.split(' ')[0]?.trim() || 'Personalen';
  const endDate = new Date(lastIso);
  if (Number.isNaN(endDate.getTime())) return null;
  const hour = endDate.getHours();
  const lateEvening = hour >= 21 || hour < 5;

  const type: SegmentType = lastSegment.type;

  if (type === 'private') {
    return {
      kind: 'home_end_of_day',
      text: `${who} kom hem — avslutad dag triggades automatiskt och bakgrundsloggningen stängdes av.`,
      warn: false,
    };
  }

  if (type === 'gps_gap') {
    return {
      kind: 'signal_lost',
      text: 'GPS-signalen tappades efter sista händelsen — möjligen inomhus, dålig täckning eller telefonen i fickan utan rörelse.',
      warn: true,
    };
  }

  if (type === 'unknown_place') {
    return {
      kind: 'signal_lost',
      text: 'Sista positionerna kunde inte kopplas till en känd plats — inga fler pings registrerades därefter.',
      warn: true,
    };
  }

  if (type === 'travel') {
    return {
      kind: 'travel_cutoff',
      text: 'Loggningen tystnade mitt under en förflyttning — troligen tomt batteri, app i bakgrunden eller avslagen GPS.',
      warn: true,
    };
  }

  if (type === 'work') {
    if (lateEvening) {
      return {
        kind: 'normal_end_of_day',
        text: `${who} stannade kvar på platsen — inga fler pings förväntas efter arbetsdagens slut.`,
        warn: false,
      };
    }
    return {
      kind: 'battery_or_app_closed',
      text: `Inga fler pings efter detta — troligen tomt batteri, app stängd eller GPS avstängd innan ${who} lämnade platsen.`,
      warn: true,
    };
  }

  return {
    kind: 'unknown',
    text: 'Inga fler pings registrerades efter sista blocket.',
    warn: false,
  };
}
