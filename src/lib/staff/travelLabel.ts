/**
 * travelLabel — gemensam fallback för "från / till" på travel_time_logs.
 *
 * Bakgrund: gap-derived travel skapas via mobile-app-api/handleCreateTravelFromGap
 * och försöker reverseGeocoda from/to-koordinater. Om Mapbox inte returnerar något
 * (eller om ingen GPS-ping fanns inom ±15 min) blir from_address/to_address NULL
 * och UI har historiskt renderat "—" — vilket är värdelöst för admin som vill
 * veta "från vart då?".
 *
 * Lyckligtvis lagras alltid en mänsklig beskrivning på formatet
 *   "Gap: <prev_target_label> → <next_target_label> (N min)"
 * när raden skapas. Vi parsar den och använder som fallback.
 *
 * Återanvänds av:
 *   - src/lib/time/StaffDayTimelineBuilder.ts (subtitle på travel-segment)
 *   - src/lib/staff/timeReportReviewEntry.ts (label på review-raden)
 *   - src/components/staff/StaffTimeReportDetail.tsx (description-kolumn)
 *   - src/components/staff/TimeReportReviewTable.tsx (föreslagen restid)
 */

const GAP_DESC_RE = /^Gap:\s*(.+?)\s*→\s*(.+?)\s*\(\d+\s*min\)\s*$/i;

export interface TravelLabelInput {
  from_address?: string | null;
  to_address?: string | null;
  description?: string | null;
}

export interface TravelLabels {
  fromLabel: string | null;
  toLabel: string | null;
  /** True om vi fyllde fältet från description, false om from_address/to_address fanns. */
  fromFromDescription: boolean;
  toFromDescription: boolean;
}

export function parseGapDescription(description: string | null | undefined): { from: string | null; to: string | null } {
  if (!description) return { from: null, to: null };
  const m = GAP_DESC_RE.exec(description.trim());
  if (!m) return { from: null, to: null };
  const from = (m[1] || '').trim() || null;
  const to = (m[2] || '').trim() || null;
  return { from, to };
}

export function resolveTravelLabels(t: TravelLabelInput): TravelLabels {
  const parsed = parseGapDescription(t.description);
  const fromAddr = (t.from_address || '').trim() || null;
  const toAddr = (t.to_address || '').trim() || null;
  const fromLabel = fromAddr ?? parsed.from;
  const toLabel = toAddr ?? parsed.to;
  return {
    fromLabel,
    toLabel,
    fromFromDescription: !fromAddr && !!parsed.from,
    toFromDescription: !toAddr && !!parsed.to,
  };
}
