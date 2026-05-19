/**
 * suppressEmptySignalGapReviewBlocks
 * ──────────────────────────────────
 * UI-suppression-pass som körs SIST i buildReportCandidateBlocks, efter all
 * konsolidering/single-timeline men före final Stockholm-day-klipp.
 *
 * Markerar (via `hiddenReason`) sådana `needs_review`-block som inte ska
 * renderas i Gantt/timeline eftersom de:
 *
 *   A) `open_day_signal_gap_without_presence`
 *      — `signal_gap_open_day` / `clamped_to_day_end_decision`-block utan
 *        target, utan confirmed/probable minuter och utan riktig presence-
 *        source (alla källblock är signal_gap/uncertain_transition).
 *
 *   B) `pre_first_gps_signal_gap`
 *      — Block som slutar före (eller mycket nära) dagens FÖRSTA riktiga
 *        GPS-/presence-ping. Dvs ett midnattshäng från gammal open day som
 *        inte ska bli arbets-/review-block.
 *
 *   C) `short_onsite_anchor_noise`
 *      — Tunt confirmed/probable_on_site-block (< 5 min) som följs direkt
 *        av ett signal_gap/needs_review ≥ 60 min. Den 1-min-blippen får
 *        inte ankra en flera-timmar lång review-period när det inte finns
 *        annan presence efter.
 *
 * Pure. Muterar bara `hiddenReason` / `warningReason` på block i listan.
 * Påverkar INTE totals / time_reports / lön — hidden block hoppas över i
 * summary-loopen och filtreras bort av Gantt-mirror innan rendering.
 *
 * Returnerar diagnostics (counts + minutes) som integreras i
 * ReportCandidateSummary.signalGapSuppressionDiagnostics.
 */

import type {
  ReportCandidateBlock,
  PresenceDayBlock,
} from './buildReportCandidateBlocks.ts';

export interface SignalGapSuppressionDiagnostics {
  openDaySignalGapSuppressedCount: number;
  openDaySignalGapSuppressedMinutes: number;
  preFirstGpsSignalGapSuppressedCount: number;
  preFirstGpsSignalGapSuppressedMinutes: number;
  shortOnSiteAnchorSuppressedCount: number;
  shortOnSiteAnchorSuppressedMinutes: number;
  firstUsableGpsTs: string | null;
}

const SHORT_ONSITE_MAX_MIN = 5;
const FOLLOWING_GAP_MIN = 60;
const PRE_GPS_TOLERANCE_SEC = 60;

const isSignalGapKindRaw = (k: string | undefined): boolean =>
  k === 'signal_gap' || k === 'uncertain_transition';

const isOnSiteKindRaw = (k: string | undefined): boolean =>
  k === 'confirmed_on_site' || k === 'probable_on_site';

const parseMs = (iso: string | null | undefined): number => {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

const minutesBetween = (aIso: string, bIso: string): number => {
  const a = parseMs(aIso);
  const b = parseMs(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60_000));
};

const isReviewBlock = (b: ReportCandidateBlock): boolean =>
  b.kind === 'needs_review' || b.reviewState === 'needs_review';

const reasonsHas = (b: ReportCandidateBlock, ...needles: string[]): boolean => {
  const set = new Set(b.reviewReasons ?? []);
  return needles.some((n) => set.has(n));
};

/**
 * Första "riktiga" GPS-/presence-ankare på dagen — första presenceDayBlock
 * vars kind inte är signal_gap/uncertain_transition och som har minst en
 * ping. Den används för regel B (pre_first_gps_signal_gap).
 */
const findFirstUsableGpsTs = (
  presenceDayBlocks: PresenceDayBlock[],
): string | null => {
  const sorted = [...presenceDayBlocks].sort((a, b) =>
    parseMs(a.startAt) - parseMs(b.startAt));
  for (const p of sorted) {
    if (isSignalGapKindRaw(p.kind)) continue;
    const pings = p.evidence?.pingCount ?? 0;
    // confirmed_on_site / probable_on_site / transport / unknown_place med ping
    if (pings > 0) return p.startAt;
    // även om pingCount saknas men kind är clearly non-gap betraktar vi den
    // som första användbara ankare (defensivt — vissa block saknar pingCount).
    if (p.kind === 'confirmed_on_site' || p.kind === 'transport') return p.startAt;
  }
  return null;
};

const markHidden = (
  b: ReportCandidateBlock,
  reason: NonNullable<ReportCandidateBlock['hiddenReason']>,
  warning: string,
): void => {
  // Behåll första hiddenReason om någon redan finns (idempotent).
  if (!b.hiddenReason) b.hiddenReason = reason;
  if (!b.warningReason) b.warningReason = warning;
  const reasons = new Set(b.reviewReasons ?? []);
  reasons.add(warning);
  b.reviewReasons = Array.from(reasons);
};

export interface SuppressInput {
  blocks: ReportCandidateBlock[];
  presenceDayBlocks: PresenceDayBlock[];
  /** Aktiva TR/LTE/time_reports som täcker hela on-site-blippen + någon minut
   *  efter — då räknas blocken som ankrade och suppressas INTE.
   *  Förenklat: en lista av { startAt, endAt } i ISO. */
  ankerWindows?: Array<{ startAt: string; endAt: string }>;
}

const isBlippAnkratAvTimer = (
  block: ReportCandidateBlock,
  ankerWindows: Array<{ startAt: string; endAt: string }>,
): boolean => {
  if (!ankerWindows || ankerWindows.length === 0) return false;
  const bs = parseMs(block.startAt);
  const be = parseMs(block.endAt);
  if (!Number.isFinite(bs) || !Number.isFinite(be)) return false;
  for (const w of ankerWindows) {
    const ws = parseMs(w.startAt);
    const we = parseMs(w.endAt);
    if (!Number.isFinite(ws) || !Number.isFinite(we)) continue;
    // Timer täcker hela blocket OCH sträcker sig minst 5 min efter.
    if (ws <= bs && we >= be + 5 * 60_000) return true;
  }
  return false;
};

export function suppressEmptySignalGapReviewBlocks(
  input: SuppressInput,
): SignalGapSuppressionDiagnostics {
  const { blocks, presenceDayBlocks, ankerWindows = [] } = input;

  const diag: SignalGapSuppressionDiagnostics = {
    openDaySignalGapSuppressedCount: 0,
    openDaySignalGapSuppressedMinutes: 0,
    preFirstGpsSignalGapSuppressedCount: 0,
    preFirstGpsSignalGapSuppressedMinutes: 0,
    shortOnSiteAnchorSuppressedCount: 0,
    shortOnSiteAnchorSuppressedMinutes: 0,
    firstUsableGpsTs: null,
  };

  const firstGpsTs = findFirstUsableGpsTs(presenceDayBlocks);
  diag.firstUsableGpsTs = firstGpsTs;
  const firstGpsMs = firstGpsTs ? parseMs(firstGpsTs) : NaN;

  // ─── Regel A: open_day_signal_gap_without_presence ─────────────────────
  for (const b of blocks) {
    if (b.hiddenReason) continue;
    if (!isReviewBlock(b)) continue;
    if (!reasonsHas(b, 'signal_gap_open_day', 'clamped_to_day_end_decision')) continue;

    const ev = b.evidenceSummary;
    const confirmed = ev?.confirmedMinutes ?? 0;
    const probable = ev?.probableMinutes ?? 0;
    const hasTarget = !!(b.targetId || b.targetLabel);
    const sourceIds = b.sourcePresenceBlockIds ?? [];

    // Alla källblock måste vara signal_gap/uncertain_transition (eller saknas).
    const allSourcesAreGap = sourceIds.length === 0 || sourceIds.every((sid) => {
      const p = presenceDayBlocks.find((pb) => pb.id === sid);
      if (!p) return true;
      return isSignalGapKindRaw(p.kind);
    });

    if (confirmed === 0 && probable === 0 && !hasTarget && allSourcesAreGap) {
      markHidden(b, 'open_day_signal_gap_without_presence', 'signal_gap_open_day_suppressed');
      diag.openDaySignalGapSuppressedCount += 1;
      diag.openDaySignalGapSuppressedMinutes += b.durationMinutes;
    }
  }

  // ─── Regel B: pre_first_gps_signal_gap ─────────────────────────────────
  if (Number.isFinite(firstGpsMs)) {
    for (const b of blocks) {
      if (b.hiddenReason) continue;
      if (!isReviewBlock(b)) continue;
      const endMs = parseMs(b.endAt);
      if (!Number.isFinite(endMs)) continue;
      // Blocket slutar senast PRE_GPS_TOLERANCE_SEC efter första riktiga GPS.
      if (endMs > firstGpsMs + PRE_GPS_TOLERANCE_SEC * 1000) continue;

      const ev = b.evidenceSummary;
      const confirmed = ev?.confirmedMinutes ?? 0;
      const probable = ev?.probableMinutes ?? 0;
      if (confirmed > 0 || probable > 0) continue;

      // dominerande kind = gap (alla källor är gap eller inga källor alls).
      const sourceIds = b.sourcePresenceBlockIds ?? [];
      const allSourcesAreGap = sourceIds.length === 0 || sourceIds.every((sid) => {
        const p = presenceDayBlocks.find((pb) => pb.id === sid);
        if (!p) return true;
        return isSignalGapKindRaw(p.kind);
      });
      if (!allSourcesAreGap) continue;

      markHidden(b, 'pre_first_gps_signal_gap', 'signal_gap_pre_first_gps_suppressed');
      diag.preFirstGpsSignalGapSuppressedCount += 1;
      diag.preFirstGpsSignalGapSuppressedMinutes += b.durationMinutes;
    }
  }

  // ─── Regel C: short_onsite_anchor_noise ────────────────────────────────
  // Itererar över VISBLA block sorterade i tid (hidden hoppas över).
  const visibleSorted = blocks
    .filter((b) => !b.hiddenReason)
    .sort((a, b) => parseMs(a.startAt) - parseMs(b.startAt));

  for (let i = 0; i < visibleSorted.length - 1; i++) {
    const cur = visibleSorted[i];
    const next = visibleSorted[i + 1];
    if (cur.kind !== 'work') continue;
    if (cur.durationMinutes >= SHORT_ONSITE_MAX_MIN) continue;
    // Endast on-site-ankare (confirmed/probable). Vi har tappat raw-kinden,
    // så vi godtar 'work' när det inte är transport och har target.
    // För att vara säkra: kräv att blocket har confirmed/probable evidence.
    const ev = cur.evidenceSummary;
    const hasOnSiteEv = (ev?.confirmedMinutes ?? 0) + (ev?.probableMinutes ?? 0) > 0;
    if (!hasOnSiteEv) continue;

    // Följande block måste vara ett stort signal_gap/needs_review.
    const isFollowingGap =
      (next.kind === 'needs_review' || next.kind === 'unknown') &&
      next.durationMinutes >= FOLLOWING_GAP_MIN;
    if (!isFollowingGap) continue;

    if (isBlippAnkratAvTimer(cur, ankerWindows)) continue;

    markHidden(cur, 'short_onsite_anchor_noise', 'short_onsite_anchor_suppressed');
    diag.shortOnSiteAnchorSuppressedCount += 1;
    diag.shortOnSiteAnchorSuppressedMinutes += cur.durationMinutes;
  }

  return diag;
}
