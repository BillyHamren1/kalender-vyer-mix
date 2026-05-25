/**
 * travelLabel — gemensam fallback för "från / till" på travel_time_logs.
 *
 * Prioritet:
 *   1) from_address / to_address (reverse-geocodad gata)
 *   2) "Gap: X → Y (N min)" / "Auto-switch X → Y" / "Switch: X → Y"
 *      parsad ur description (projekt-/platsnamn)
 *   3) Koordinatfallback "Pos 59.262, 17.892" — så att vi aldrig visar "—"
 *      när vi faktiskt har GPS-punkter.
 *
 * Återanvänds av:
 *   - src/lib/time/StaffDayTimelineBuilder.ts (subtitle på travel-segment)
 *   - src/lib/staff/timeReportReviewEntry.ts (label på review-raden)
 *   - src/components/staff/StaffTimeReportDetail.tsx (description-kolumn)
 *   - src/components/staff/TimeReportReviewTable.tsx (föreslagen restid)
 *   - src/lib/staff/dayJournal.ts (journal-block label)
 */

const GAP_DESC_RE = /^(?:Gap|Auto[-\s]?switch|Switch):\s*(.+?)\s*→\s*(.+?)(?:\s*\(\d+\s*min\))?\s*$/i;

export interface TravelLabelInput {
  from_address?: string | null;
  to_address?: string | null;
  description?: string | null;
  from_latitude?: number | null;
  from_longitude?: number | null;
  to_latitude?: number | null;
  to_longitude?: number | null;
}

export interface TravelLabels {
  fromLabel: string | null;
  toLabel: string | null;
  /** True om vi fyllde fältet från description (eller koordinater), false om from_address/to_address fanns. */
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

function coordLabel(lat?: number | null, lng?: number | null): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `Pos ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function resolveTravelLabels(t: TravelLabelInput): TravelLabels {
  const parsed = parseGapDescription(t.description);
  const fromAddr = (t.from_address || '').trim() || null;
  const toAddr = (t.to_address || '').trim() || null;
  const fromCoord = coordLabel(t.from_latitude, t.from_longitude);
  const toCoord = coordLabel(t.to_latitude, t.to_longitude);
  const fromLabel = fromAddr ?? parsed.from ?? fromCoord;
  const toLabel = toAddr ?? parsed.to ?? toCoord;
  return {
    fromLabel,
    toLabel,
    fromFromDescription: !fromAddr && (!!parsed.from || !!fromCoord),
    toFromDescription: !toAddr && (!!parsed.to || !!toCoord),
  };
}
