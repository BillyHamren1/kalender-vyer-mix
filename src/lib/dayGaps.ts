/**
 * dayGaps — derives "uncertain travel candidates" between two consecutive
 * activities on the same day, for use in the day-review UI.
 *
 * OFFICIELL TIDMODELL (Tidappen):
 *   • Dagtimer = hela arbetsdagen
 *   • Aktivitet = projekt/plats/bokning
 *   • Restid   = GAPET mellan två aktiviteter när gapet är rimligt
 *
 * Live GPS-travel är legacy/assist. Den auktoritativa källan för restid
 * är användarens bekräftelse i review av dessa gaps.
 *
 * Regler (samma som server-sidans planerade `createTravelFromGap`):
 *   • < 10 min  → ingen kandidat (för kort, troligen inom samma plats)
 *   • 10–180 min → kandidat (visa i review)
 *   • > 180 min → needs_review-kandidat (visa, men markera tydligt)
 *   • cross-day → ingen kandidat
 */

import type { MobileTimeReport, MobileTravelLog } from '@/services/mobileApiService';

export type GapKind = 'candidate' | 'needs_review';

export interface DayGap {
  /** Stable client key: `${prev.id}->${next.id}`. */
  key: string;
  prevReportId: string;
  nextReportId: string;
  prevLabel: string;
  nextLabel: string;
  /** ISO of the previous activity's end_time. */
  startIso: string;
  /** ISO of the next activity's start_time. */
  endIso: string;
  gapMinutes: number;
  kind: GapKind;
}

/** Pretty fallback label for a time_report if booking is missing. */
function reportLabel(r: MobileTimeReport): string {
  if (r.large_project_name) return r.large_project_name;
  if (r.bookings?.client) return r.bookings.client;
  return 'Aktivitet';
}

/** Returns true if this gap is already covered by a travel_time_log. */
function isCoveredByTravel(
  startIso: string,
  endIso: string,
  travels: Array<{ start_time: string; end_time: string | null }>,
): boolean {
  const gapStart = new Date(startIso).getTime();
  const gapEnd = new Date(endIso).getTime();
  for (const t of travels) {
    const ts = new Date(t.start_time).getTime();
    const te = t.end_time ? new Date(t.end_time).getTime() : Date.now();
    // Overlap test: travel intersects the gap window meaningfully.
    if (te >= gapStart && ts <= gapEnd) return true;
  }
  return false;
}

/**
 * Compute uncertain travel-gap candidates for a single day.
 *
 * @param reports  All time_reports for the staff member (any date).
 * @param travels  Travel logs for the day (from listWorkdaysReview).
 * @param dayKey   YYYY-MM-DD — only reports with this report_date are used.
 */
export function computeDayGaps(
  reports: MobileTimeReport[],
  travels: Array<{ id: string; start_time: string; end_time: string | null; classification: string | null }>,
  dayKey: string,
): DayGap[] {
  // Filter & order reports for the day with both start_time and end_time set.
  const dayReports = reports
    .filter((r) => r.report_date === dayKey && r.start_time && r.end_time)
    .slice()
    .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime());

  if (dayReports.length < 2) return [];

  const gaps: DayGap[] = [];
  for (let i = 0; i < dayReports.length - 1; i++) {
    const prev = dayReports[i];
    const next = dayReports[i + 1];
    const prevEnd = new Date(prev.end_time!).getTime();
    const nextStart = new Date(next.start_time!).getTime();
    const gapMs = nextStart - prevEnd;
    if (gapMs <= 0) continue; // overlap or back-to-back

    // Cross-day guard (defensive — same dayKey filter above usually ensures this).
    const sameDay =
      new Date(prev.end_time!).toISOString().slice(0, 10) ===
      new Date(next.start_time!).toISOString().slice(0, 10);
    if (!sameDay) continue;

    const gapMin = Math.round(gapMs / 60_000);
    if (gapMin < 10) continue;

    const startIso = prev.end_time!;
    const endIso = next.start_time!;
    if (isCoveredByTravel(startIso, endIso, travels)) continue;

    gaps.push({
      key: `${prev.id}->${next.id}`,
      prevReportId: prev.id,
      nextReportId: next.id,
      prevLabel: reportLabel(prev),
      nextLabel: reportLabel(next),
      startIso,
      endIso,
      gapMinutes: gapMin,
      kind: gapMin > 180 ? 'needs_review' : 'candidate',
    });
  }

  return gaps;
}

// ── Local "resolved gap" tracking ────────────────────────────────────
// User can mark a gap as paus/privat or ignore it. We persist that
// decision locally so the gap doesn't keep showing up in review.
//
// This is intentionally client-only: gaps are derived data, not first-class
// rows. If/when the server gains a `time_report_gap_decisions` table, this
// helper is the integration seam to swap.

const STORAGE_KEY = 'eventflow.dayReview.resolvedGaps.v1';

type ResolvedGapStore = Record<string, { resolution: 'pause' | 'ignored'; at: string }>;

function readStore(): ResolvedGapStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ResolvedGapStore;
  } catch {
    return {};
  }
}

function writeStore(store: ResolvedGapStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full / private mode — ignore */
  }
}

export function isGapResolvedLocally(gapKey: string): boolean {
  return Boolean(readStore()[gapKey]);
}

export function markGapResolvedLocally(
  gapKey: string,
  resolution: 'pause' | 'ignored',
) {
  const store = readStore();
  store[gapKey] = { resolution, at: new Date().toISOString() };
  writeStore(store);
}

export function filterUnresolvedGaps(gaps: DayGap[]): DayGap[] {
  const store = readStore();
  return gaps.filter((g) => !store[g.key]);
}
