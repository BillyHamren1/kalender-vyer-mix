// Time Engine 4.5 + 3.11 — clampBlocksToDayEndDecision
// ─────────────────────────────────────────────────────
// Pure helper. Tar ett färdigt set av ReportCandidateBlock + en redan
// beräknad DayEndDecision, och säkerställer att INGET synligt block kan
// fortsätta efter dayEndDecision.endedAt eller efter Stockholm-dagens slut.
//
// Körs sist i pipelinen — efter:
//   1. active timer handling
//   2. session consolidation
//   3. enforceSingleVisibleTimeline
//
// Regler (alla mätta i ms i UTC):
//   - dayEnded=true + endedAt finns:
//       * block.startAt >= endedAt        → block tas bort, returneras i `dropped`
//       * block.endAt   >  endedAt        → klipps till endedAt
//       * isOngoing                       → forceras false för alla block
//       * lägger till reviewReason 'clamped_to_day_end_decision'
//       * lägger till warningReason 'visible_block_clamped_to_day_end' om kapad
//   - input.date är inte dagens datum i Europe/Stockholm:
//       * isOngoing forceras false (Date.now får aldrig vara visible end)
//       * inga block får sluta efter Stockholm dayEnd för det datumet → klipp
//   - active timer är öppen efter endedAt (anchor block matchar openActiveStartedAtIso):
//       * diagnostic 'open_active_timer_ignored_after_day_end' sätts på blocket
//       * blocket räknas i openActiveTimersIgnoredAfterDayEnd
//
// Skriver INGENTING. Inga DB-anrop. Idempotent.

import type { ReportCandidateBlock } from './buildReportCandidateBlocks.ts';
import type { DayEndDecision } from './computeDayEndDecision.ts';
import { getStockholmDayWindowUtc, stockholmDateKey } from '../stockholmDayWindow.ts';

export interface ClampBlocksToDayEndDecisionInput {
  /** YYYY-MM-DD (Stockholm) — rapportdagen blocken hör till. */
  date: string;
  blocks: ReportCandidateBlock[];
  dayEndDecision: DayEndDecision;
  /** ISO för "nu". Används bara för is-today-check. */
  nowIso: string;
  /** Öppen active timer (om det finns) — för att kunna sätta open_active_timer_ignored_after_day_end. */
  openActiveStartedAtIso?: string | null;
}

export interface ClampBlocksToDayEndDecisionResult {
  blocks: ReportCandidateBlock[];
  dropped: ReportCandidateBlock[];
  /** Time Engine 3.11 — namngivna räknare per spec. */
  dayEndClampDiagnostics: {
    blocksClampedToDayEnd: number;
    blocksRemovedAfterDayEnd: number;
    openActiveTimersIgnoredAfterDayEnd: number;
    blocksClampedToStockholmDayEnd: number;
    forcedOngoingFalse: number;
    dayEnded: boolean;
    endedAt: string | null;
    isToday: boolean;
    examples: Array<{
      action: 'clamped_to_day_end' | 'removed_after_day_end' | 'open_active_timer_ignored' | 'clamped_to_stockholm_day_end' | 'forced_ongoing_false';
      blockId: string | null;
      blockKind: string | null;
      blockLabel: string | null;
      originalStartAt: string;
      originalEndAt: string;
      newEndAt?: string;
      reason: string;
    }>;
  };
  /** Bakåtkompatibel diagnostik (4.5-format), behålls för enrichment-/aggregate-konsumenter. */
  diagnostics: {
    dayEnded: boolean;
    endedAt: string | null;
    blocksClamped: number;
    blocksDropped: number;
    forcedOngoingFalse: number;
    openActiveTimerIgnored: boolean;
    isToday: boolean;
  };
}

const DROP_REASON = 'dropped_after_day_end_decision';
const CLAMP_REASON = 'clamped_to_day_end_decision';
const CLAMP_WARNING = 'visible_block_clamped_to_day_end';
const STOCKHOLM_CLAMP_REASON = 'clamped_to_stockholm_day_end';
const STOCKHOLM_CLAMP_WARNING = 'visible_block_clamped_to_stockholm_day_end';
const OPEN_TIMER_IGNORED_TAG = 'open_active_timer_ignored_after_day_end';

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function clampBlocksToDayEndDecision(
  input: ClampBlocksToDayEndDecisionInput,
): ClampBlocksToDayEndDecisionResult {
  const { date, blocks, dayEndDecision, nowIso, openActiveStartedAtIso } = input;

  const isToday = stockholmDateKey(nowIso) === date;
  const endedAtMs =
    dayEndDecision.dayEnded && dayEndDecision.endedAt
      ? new Date(dayEndDecision.endedAt).getTime()
      : null;
  const stockholmWin = getStockholmDayWindowUtc(date);
  const stockholmEndMs = stockholmWin.endUtcMs;

  const out: ReportCandidateBlock[] = [];
  const dropped: ReportCandidateBlock[] = [];
  let blocksClamped = 0;
  let blocksClampedStockholm = 0;
  let forcedOngoingFalse = 0;
  let openActiveTimerIgnoredCount = 0;

  const examples: ClampBlocksToDayEndDecisionResult['dayEndClampDiagnostics']['examples'] = [];
  const pushExample = (
    ex: ClampBlocksToDayEndDecisionResult['dayEndClampDiagnostics']['examples'][number],
  ) => {
    if (examples.length < 25) examples.push(ex);
  };

  const openMs = openActiveStartedAtIso ? new Date(openActiveStartedAtIso).getTime() : null;
  const labelOf = (b: ReportCandidateBlock) => b.targetLabel ?? b.title ?? null;

  for (const raw of blocks) {
    const b: ReportCandidateBlock = { ...raw, reviewReasons: [...(raw.reviewReasons ?? [])] };
    const origStart = b.startAt;
    const origEnd = b.endAt;

    // Regel: historisk dag → ingen isOngoing.
    if (!isToday && b.isOngoing) {
      b.isOngoing = false;
      forcedOngoingFalse += 1;
      pushExample({
        action: 'forced_ongoing_false',
        blockId: b.id ?? null,
        blockKind: b.kind ?? null,
        blockLabel: labelOf(b),
        originalStartAt: origStart,
        originalEndAt: origEnd,
        reason: 'historical_day_no_ongoing',
      });
    }

    if (endedAtMs == null) {
      // Ingen explicit dayEnd-decision — fortsätt direkt till Stockholm-clamp nedan.
    } else {
      const sMs = new Date(b.startAt).getTime();
      const eMs = new Date(b.endAt).getTime();

      // Block börjar efter endedAt → tas bort helt.
      if (sMs >= endedAtMs) {
        const dropTag = `${DROP_REASON}:${b.id ?? 'unknown'}`;
        const isOpenAnchor = openMs != null && Math.abs(sMs - openMs) < 2 * 60_000;
        if (isOpenAnchor) openActiveTimerIgnoredCount += 1;
        dropped.push({
          ...b,
          reviewReasons: Array.from(new Set([...(b.reviewReasons ?? []), DROP_REASON, dropTag])),
          warningReasons: Array.from(new Set([
            ...(b.warningReasons ?? []),
            DROP_REASON,
            ...(isOpenAnchor ? [OPEN_TIMER_IGNORED_TAG] : []),
          ])),
        });
        pushExample({
          action: isOpenAnchor ? 'open_active_timer_ignored' : 'removed_after_day_end',
          blockId: b.id ?? null,
          blockKind: b.kind ?? null,
          blockLabel: labelOf(b),
          originalStartAt: origStart,
          originalEndAt: origEnd,
          reason: isOpenAnchor
            ? 'open_active_timer_starts_after_day_end'
            : 'block_starts_after_day_end',
        });
        continue;
      }

      // Block överlappar endedAt → klipp.
      if (eMs > endedAtMs) {
        const newEndIso = new Date(endedAtMs).toISOString();
        b.endAt = newEndIso;
        b.durationMinutes = minutesBetween(b.startAt, b.endAt);
        b.durationLabel = fmtDuration(b.durationMinutes);
        b.subtitle = `${fmtClock(b.startAt)}–${fmtClock(b.endAt)} · ${fmtDuration(b.durationMinutes)}`;
        const wasOngoing = b.isOngoing === true;
        b.isOngoing = false;
        if (wasOngoing) forcedOngoingFalse += 1;
        b.reviewReasons = Array.from(new Set([...(b.reviewReasons ?? []), CLAMP_REASON]));
        b.warningReasons = Array.from(new Set([...(b.warningReasons ?? []), CLAMP_WARNING]));

        const isOpenAnchor = openMs != null && Math.abs(sMs - openMs) < 2 * 60_000;
        if (isOpenAnchor) {
          openActiveTimerIgnoredCount += 1;
          b.warningReasons = Array.from(new Set([...(b.warningReasons ?? []), OPEN_TIMER_IGNORED_TAG]));
        }
        blocksClamped += 1;
        pushExample({
          action: isOpenAnchor ? 'open_active_timer_ignored' : 'clamped_to_day_end',
          blockId: b.id ?? null,
          blockKind: b.kind ?? null,
          blockLabel: labelOf(b),
          originalStartAt: origStart,
          originalEndAt: origEnd,
          newEndAt: newEndIso,
          reason: isOpenAnchor
            ? 'open_active_timer_extends_past_day_end'
            : 'block_overlaps_day_end',
        });
      }
    }

    // Slutligen: om dayEnded och blocket fortfarande markerat ongoing → tvinga false.
    if (endedAtMs != null && b.isOngoing) {
      b.isOngoing = false;
      forcedOngoingFalse += 1;
    }

    // ─── Stockholm dayEnd clamp ──────────────────────────────────────────
    // Spec 3.11: "Om input.date inte är dagens datum i Europe/Stockholm:
    //   - inga blocks får sluta efter Stockholm dayEnd"
    //   - Date.now får inte användas för visible end
    if (!isToday) {
      const eMs = new Date(b.endAt).getTime();
      if (eMs > stockholmEndMs) {
        const newEndIso = new Date(stockholmEndMs).toISOString();
        const prevEnd = b.endAt;
        b.endAt = newEndIso;
        b.durationMinutes = minutesBetween(b.startAt, b.endAt);
        b.durationLabel = fmtDuration(b.durationMinutes);
        b.subtitle = `${fmtClock(b.startAt)}–${fmtClock(b.endAt)} · ${fmtDuration(b.durationMinutes)}`;
        b.isOngoing = false;
        b.reviewReasons = Array.from(new Set([...(b.reviewReasons ?? []), STOCKHOLM_CLAMP_REASON]));
        b.warningReasons = Array.from(new Set([...(b.warningReasons ?? []), STOCKHOLM_CLAMP_WARNING]));
        blocksClampedStockholm += 1;
        pushExample({
          action: 'clamped_to_stockholm_day_end',
          blockId: b.id ?? null,
          blockKind: b.kind ?? null,
          blockLabel: labelOf(b),
          originalStartAt: origStart,
          originalEndAt: prevEnd,
          newEndAt: newEndIso,
          reason: 'historical_day_block_extends_past_stockholm_midnight',
        });
      }
    }

    out.push(b);
  }

  const openActiveTimerIgnored = openActiveTimerIgnoredCount > 0;

  return {
    blocks: out,
    dropped,
    dayEndClampDiagnostics: {
      blocksClampedToDayEnd: blocksClamped,
      blocksRemovedAfterDayEnd: dropped.length,
      openActiveTimersIgnoredAfterDayEnd: openActiveTimerIgnoredCount,
      blocksClampedToStockholmDayEnd: blocksClampedStockholm,
      forcedOngoingFalse,
      dayEnded: dayEndDecision.dayEnded,
      endedAt: dayEndDecision.endedAt,
      isToday,
      examples,
    },
    diagnostics: {
      dayEnded: dayEndDecision.dayEnded,
      endedAt: dayEndDecision.endedAt,
      blocksClamped,
      blocksDropped: dropped.length,
      forcedOngoingFalse,
      openActiveTimerIgnored,
      isToday,
    },
  };
}
