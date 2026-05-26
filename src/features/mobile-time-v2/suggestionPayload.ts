/**
 * suggestionPayload — pure helpers för att gå från GPS-förslag
 * (MobileGpsDayView) till en skickbar ManualDayPayload, samt en
 * säkerhetsbedömning för "direkt-skicka från listan".
 *
 * Används av både MobileDayReportPreview (granska-vyn) och
 * MobileTimeReportQueue (skicka direkt från listan) så att exakt
 * samma payload byggs i båda flödena.
 *
 * Inga DB-anrop, ingen GPS-omtolkning, ingen tid-räkning. Tar bara
 * det som redan ligger i view-datan och bygger ManualDayPayload.
 */
import type {
  MobileGpsDayView,
  MobileGpsDaySegment,
  ManualDayPayload,
  ManualWorkSegmentInput,
  ManualWorkTarget,
} from './types';

// ---------------------------------------------------------------------------

export function isoToHHmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function fmtDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function targetFromMatched(seg: MobileGpsDaySegment): ManualWorkTarget | null {
  const m = seg.matched;
  if (!m || !m.kind || !m.id) return null;
  if (m.kind === 'home') return null;
  const label = m.name ?? seg.label ?? 'Förslag';
  switch (m.kind) {
    case 'project':       return { targetType: 'project',       targetId: m.id, label, subtitle: null, project_id: m.id };
    case 'large_project': return { targetType: 'large_project', targetId: m.id, label, subtitle: null, large_project_id: m.id };
    case 'location':      return { targetType: 'location',      targetId: m.id, label, subtitle: null, location_id: m.id };
    case 'booking':       return { targetType: 'booking',       targetId: m.id, label, subtitle: null, booking_id: m.id };
    default:              return null;
  }
}

// ---------------------------------------------------------------------------

/** Bygg ManualDayPayload från suggested segments — utan att räkna om GPS. */
export function buildManualDayFromSuggested(
  data: MobileGpsDayView,
  comment: string,
): ManualDayPayload | null {
  const work = (data.segments ?? []).filter(
    (s) => s.kind === 'stay' && s.durationMinutes > 0,
  );
  if (work.length === 0) return null;
  const first = work[0];
  const last = work[work.length - 1];
  const dayStart = isoToHHmm(first.currentStartTime) ?? '08:00';
  const dayEnd = isoToHHmm(last.currentEndTime) ?? '16:00';

  const segments: ManualWorkSegmentInput[] = work.map((s) => ({
    id: s.segmentKey,
    startTime: isoToHHmm(s.currentStartTime) ?? '08:00',
    endTime: isoToHHmm(s.currentEndTime) ?? '16:00',
    target: targetFromMatched(s),
    comment: null,
    sourceSegmentId: s.segmentKey,
  }));

  return {
    dayStartTime: dayStart,
    dayEndTime: dayEnd,
    breakMinutes: 0,
    segments,
    deletedSegmentIds: [],
    comment: comment.trim() || null,
  };
}

// ---------------------------------------------------------------------------

export interface DirectSubmitSafety {
  /** Tillåtet att skicka direkt utan att öppna granska-vyn? */
  ok: boolean;
  /** Mänsklig anledning till varför direkt-skicka NEKAS, om ok=false. */
  reason: string | null;
  /** Mjuka varningar som visas i Preview (inte blockerande). */
  warnings: string[];
  /** Färdig payload, eller null om inget skickbart förslag finns. */
  payload: ManualDayPayload | null;
}

/**
 * Säkerhetsbedömning för "Skicka direkt från listan".
 *
 * Regler (alla måste vara uppfyllda för ok=true):
 *  - submission.canSubmit !== false
 *  - status är inte locked (approved / payroll_approved) och inte correction_requested
 *  - minst ett work-block med durationMinutes > 0
 *  - inga 0-minutersblock bland stay-segmenten (annars granska)
 *  - varje work-block har en matchad target (project/location/booking/large_project)
 *  - totalt arbetsmin ≤ 14h (annars för ovanligt — granska)
 *  - inget block > 12h
 */
export function evaluateDirectSubmit(
  data: MobileGpsDayView,
  comment = '',
): DirectSubmitSafety {
  const submission = data.submission;
  const status = submission?.status ?? 'not_submitted';

  if (status === 'approved' || status === 'payroll_approved') {
    return { ok: false, reason: 'Dagen är redan godkänd', warnings: [], payload: null };
  }
  if (status === 'correction_requested') {
    return { ok: false, reason: 'Behöver kompletteras — granska först', warnings: [], payload: null };
  }
  if (submission && submission.canSubmit === false) {
    return { ok: false, reason: 'Får inte skickas in just nu', warnings: [], payload: null };
  }

  const workSegments = (data.segments ?? []).filter((s) => s.kind === 'stay');
  const validBlocks = workSegments.filter((s) => s.durationMinutes > 0);
  const hasZero = workSegments.length > validBlocks.length;

  if (validBlocks.length === 0) {
    return { ok: false, reason: 'Inget förslag — fyll i manuellt', warnings: [], payload: null };
  }

  const missingTarget = validBlocks.some((b) => !targetFromMatched(b));
  const totalMin = data.totals?.workMinutes ?? validBlocks.reduce((a, b) => a + b.durationMinutes, 0);
  const longBlock = validBlocks.some((b) => b.durationMinutes > 12 * 60);

  const warnings: string[] = [];
  if (totalMin > 14 * 60) warnings.push(`Föreslagen tid är ${fmtDuration(totalMin)}.`);
  if (longBlock) warnings.push('Ett block är ovanligt långt.');
  if (missingTarget) warnings.push('Något block saknar tydlig plats/projekt.');
  if (hasZero) warnings.push('Förslaget innehåller 0-minutersblock.');

  const payload = buildManualDayFromSuggested(data, comment);
  if (!payload) {
    return { ok: false, reason: 'Kunde inte bygga förslag', warnings, payload: null };
  }

  // Blockerande regler (motiveringen är ordningsberoende)
  let blocking: string | null = null;
  if (missingTarget) blocking = 'Något block saknar plats — granska och välj';
  else if (hasZero) blocking = 'Förslaget innehåller felaktiga block — granska först';
  else if (totalMin > 14 * 60) blocking = 'Föreslagen tid är ovanligt lång — granska först';
  else if (longBlock) blocking = 'Ett block är ovanligt långt — granska först';

  return {
    ok: blocking === null,
    reason: blocking,
    warnings,
    payload,
  };
}
