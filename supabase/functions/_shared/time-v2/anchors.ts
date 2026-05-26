// Time v2 — shared anchors loader + suggested-time computer.
// Purely additive. Reads staff_gps_day_anchors (no writes).
// Suggested start/end built server-side from already-built timeline segments.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AnchorConfirmationMode = "unconfirmed" | "confirmed" | "adjusted" | "dismissed";

export interface DayAnchor {
  suggestedAt: string | null;
  confirmedAt: string | null;
  confirmationMode: AnchorConfirmationMode;
  reason: string | null;
  canConfirm: boolean;
}

export interface DayAnchors {
  start: DayAnchor;
  end: DayAnchor;
}

interface AnchorRow {
  anchor_type: "start" | "end";
  suggested_at: string | null;
  confirmed_at: string | null;
  confirmation_mode: "confirmed" | "adjusted" | "dismissed";
  reason: string | null;
}

interface SegmentLike {
  currentStartTime?: string;
  currentEndTime?: string;
  kind?: string;
  durationMinutes?: number;
}

export async function loadAnchorsForDay(
  admin: SupabaseClient,
  orgId: string,
  staffId: string,
  date: string,
): Promise<AnchorRow[]> {
  try {
    const { data } = await admin
      .from("staff_gps_day_anchors")
      .select("anchor_type, suggested_at, confirmed_at, confirmation_mode, reason")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date);
    return (data ?? []) as AnchorRow[];
  } catch (e) {
    console.warn("[anchors] load failed", e);
    return [];
  }
}

/**
 * Compute server-side suggested start/end timestamps from timeline segments.
 * Picks first/last non-gap segment if available, else falls back to first/last
 * segment regardless of kind.
 */
export function computeAnchorSuggestions(
  segments: SegmentLike[],
): { startSuggested: string | null; endSuggested: string | null } {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { startSuggested: null, endSuggested: null };
  }
  const work = segments.filter((s) => s && s.kind !== "gps_gap" && (s.durationMinutes ?? 0) > 0);
  const startList = work.length > 0 ? work : segments;
  const endList = work.length > 0 ? work : segments;
  const startSuggested =
    startList[0]?.currentStartTime ?? segments[0]?.currentStartTime ?? null;
  const endSuggested =
    endList[endList.length - 1]?.currentEndTime ??
    segments[segments.length - 1]?.currentEndTime ?? null;
  return {
    startSuggested: typeof startSuggested === "string" ? startSuggested : null,
    endSuggested: typeof endSuggested === "string" ? endSuggested : null,
  };
}

/**
 * Build the anchors payload for the GPS Day View response.
 * `canConfirm` is true when the day is editable AND a suggested time exists.
 */
export function buildAnchorsPayload(opts: {
  rows: AnchorRow[];
  startSuggested: string | null;
  endSuggested: string | null;
  isLocked: boolean;
}): DayAnchors {
  const { rows, startSuggested, endSuggested, isLocked } = opts;
  const byType = new Map<"start" | "end", AnchorRow>();
  for (const r of rows) byType.set(r.anchor_type, r);

  const mk = (type: "start" | "end", suggested: string | null): DayAnchor => {
    const r = byType.get(type);
    const suggestedAt = r?.suggested_at ?? suggested ?? null;
    if (!r) {
      return {
        suggestedAt,
        confirmedAt: null,
        confirmationMode: "unconfirmed",
        reason: null,
        canConfirm: !isLocked && !!suggestedAt,
      };
    }
    return {
      suggestedAt,
      confirmedAt: r.confirmed_at,
      confirmationMode: r.confirmation_mode as AnchorConfirmationMode,
      reason: r.reason,
      canConfirm: !isLocked,
    };
  };

  return {
    start: mk("start", startSuggested),
    end: mk("end", endSuggested),
  };
}
