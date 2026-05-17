/**
 * dayStatus — Mobil UI-regel för "har dagen avslutats eller inte?"
 *
 * Spec (Mobile Time Fix):
 *   Arbetsdagen får BARA visas som avslutad om:
 *     - explicit stop från dagtimer (backend approved/submitted), eller
 *     - dagen är inskickad via staff_day_submissions
 *
 *   Segment (transport, projekt slut osv.) får ALDRIG ensamma flippa dagen
 *   till "avslutad" i UI.
 *
 *   Resultat (DayStatus):
 *     - active_day            → "Arbetsdag pågår"   (dagtimer öppen ELLER aktivt arbetsblock)
 *     - ended_day             → "Arbetsdag avslutad" (explicit submit/approve)
 *     - has_time_not_ended    → "Tid registrerad"    (segment finns men ingen explicit stop)
 *     - empty_day             → "Ingen tid registrerad"
 */

import type { StaffDaySnapshot, StaffDaySegment } from '@/hooks/useStaffDaySnapshot';

export type DayStatus =
  | 'active_day'
  | 'ended_day'
  | 'has_time_not_ended'
  | 'empty_day';

export interface DayStatusResult {
  status: DayStatus;
  label: string;
  reason: string;
  debug: {
    activeDayTimerExists: boolean;
    hasActiveWorkBlock: boolean;
    hasExplicitStoppedAt: boolean;
    hasSubmittedDay: boolean;
    lastSegmentKind: string | null;
    lastSegmentEndedAt: string | null;
  };
}

const LABEL: Record<DayStatus, string> = {
  active_day: 'Arbetsdag pågår',
  ended_day: 'Arbetsdag avslutad',
  has_time_not_ended: 'Tid registrerad',
  empty_day: 'Ingen tid registrerad',
};

function isActiveSegment(s: StaffDaySegment): boolean {
  if (!s) return false;
  if (s.isActive === true) return true;
  if (!s.endedAt) return true;
  return false;
}

function isWorkishKind(kind: string | undefined): boolean {
  if (!kind) return false;
  return (
    kind === 'project' ||
    kind === 'warehouse' ||
    kind === 'booking' ||
    kind === 'travel' ||
    kind === 'other_place' ||
    kind === 'location' ||
    kind === 'active' ||
    kind === 'work' ||
    kind === 'activity'
  );
}

export function deriveDayStatus(snapshot: StaffDaySnapshot | null): DayStatusResult {
  const wd = snapshot?.workday ?? null;
  const segments = snapshot?.segments ?? [];
  const activeDayTimerExists = !!wd?.isOpen;
  const hasActiveWorkBlock = segments.some(
    (s) => isActiveSegment(s) && isWorkishKind(s.kind as string),
  );

  // Explicit submit/approve = enda säkra "ended"-signalen i mobil-snapshoten.
  // wd.endedAt ensam räcker INTE — backend kan auto-stänga dagen när sista
  // segmentet slutar, vilket UI inte får tolka som "användaren avslutade dagen".
  const reviewStatus = (wd?.reviewStatus ?? '').toLowerCase();
  const hasSubmittedDay =
    !!wd?.approved ||
    reviewStatus === 'submitted' ||
    reviewStatus === 'approved' ||
    reviewStatus === 'attested';
  const hasExplicitStoppedAt = hasSubmittedDay; // i denna modell synonym

  const lastSeg =
    segments.length > 0
      ? segments.reduce<StaffDaySegment>((acc, s) => {
          const aEnd = acc.endedAt ?? acc.startedAt;
          const sEnd = s.endedAt ?? s.startedAt;
          return new Date(sEnd).getTime() > new Date(aEnd).getTime() ? s : acc;
        }, segments[0])
      : null;

  const debug = {
    activeDayTimerExists,
    hasActiveWorkBlock,
    hasExplicitStoppedAt,
    hasSubmittedDay,
    lastSegmentKind: (lastSeg?.kind as string) ?? null,
    lastSegmentEndedAt: lastSeg?.endedAt ?? null,
  };

  // 1) Aktiv dag — antingen riktig dagtimer eller pågående arbetsblock.
  if (activeDayTimerExists || hasActiveWorkBlock) {
    return {
      status: 'active_day',
      label: LABEL.active_day,
      reason: activeDayTimerExists ? 'workday.isOpen=true' : 'hasActiveWorkBlock=true',
      debug,
    };
  }

  // 2) Avslutad dag — endast vid explicit submit/approve.
  if (hasExplicitStoppedAt) {
    return {
      status: 'ended_day',
      label: LABEL.ended_day,
      reason: hasSubmittedDay ? 'hasSubmittedDay=true' : 'explicit stop',
      debug,
    };
  }

  // 3) Tid finns men ingen explicit stop → "Tid registrerad" (INTE avslutad).
  if (segments.length > 0 || (wd && (wd.durationMinutes ?? 0) > 0)) {
    return {
      status: 'has_time_not_ended',
      label: LABEL.has_time_not_ended,
      reason: 'segments_exist_without_submit',
      debug,
    };
  }

  // 4) Tomt
  return {
    status: 'empty_day',
    label: LABEL.empty_day,
    reason: 'no_workday_no_segments',
    debug,
  };
}
