// Pure mapper: Time Engine cache blocks → MobileSegment[].
//
// Mobile is a MIRROR — the mobile UI never re-interprets, splits or re-derives
// blocks. Source priority is owned by `pickCacheBlocks` (display first, then
// candidate). Both the edge function and frontend MUST go through this mapper.
//
// We deliberately DROP raw engine-debug block kinds that admin web also hides:
//   - signal_gap, uncertain_transition, missing_transition_evidence
//   - micro_movement, internal_transport (already absorbed in normal flow)
// These would only ever appear if a future engine version emits them through
// display_blocks_json by accident — guarding here keeps mobile in sync.
import type {
  MobileSegment,
  MobileSegmentConfidence,
  MobileSegmentKind,
} from "./types.ts";

interface RawBlock {
  id?: string;
  kind?: string;
  startAt?: string;
  endAt?: string;
  durationMinutes?: number;
  title?: string;
  displayLabel?: string | null;
  subtitle?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  confidence?: string;
  reviewState?: string;
  reviewReasons?: string[];
  warningLabel?: string | null;
  warningReasons?: string[];
  signalGapMinutes?: number;
}

/**
 * Source-of-truth selector for which cache JSON column the mobile mirror
 * should render. Priority matches the request:
 *   1. display_blocks_json    (Time Engine consumer-facing)
 *   2. report_candidate_blocks_json (engine raw, same shape today)
 *
 * Returns [] when both are missing/empty so callers can decide on a
 * presence-day fallback.
 */
export function pickCacheBlocks(cache: {
  display_blocks_json?: unknown;
  report_candidate_blocks_json?: unknown;
} | null): unknown[] {
  if (!cache) return [];
  if (Array.isArray(cache.display_blocks_json) && cache.display_blocks_json.length > 0) {
    return cache.display_blocks_json as unknown[];
  }
  if (Array.isArray(cache.report_candidate_blocks_json) && cache.report_candidate_blocks_json.length > 0) {
    return cache.report_candidate_blocks_json as unknown[];
  }
  return [];
}

const HIDDEN_RAW_KINDS = new Set<string>([
  "signal_gap",
  "uncertain_transition",
  "missing_transition_evidence",
  "micro_movement",
  "internal_transport",
]);

function asConfidence(v: unknown): MobileSegmentConfidence {
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function pickKind(b: RawBlock): MobileSegmentKind {
  const k = String(b.kind ?? "");
  const t = String(b.targetType ?? "");
  if (k === "transport") return "travel";
  if (k === "break") return "break";
  if (k === "unknown") return "unknown";
  if (k === "needs_review") return "needs_review";
  if (k === "work" && b.reviewState === "needs_review") return "needs_review";
  if (k === "work") {
    if (t === "project") return "project";
    if (t === "booking") return "booking";
    if (t === "large_project") return "large_project";
    if (t === "warehouse") return "warehouse";
    if (t === "location") return "location";
    return "booking";
  }
  return "unknown";
}

function statusLabelFor(b: RawBlock, kind: MobileSegmentKind): string | null {
  if (b.reviewState === "needs_review") return "Behöver granskas";
  if (kind === "travel") return "Resa";
  if (kind === "break") return "Rast";
  if (kind === "unknown") return "Okänd plats";
  if (b.confidence === "high") return "Bekräftad";
  if (b.confidence === "low") return "Låg träffsäkerhet";
  return null;
}

function refsFor(b: RawBlock): {
  projectId: string | null;
  bookingId: string | null;
  largeProjectId: string | null;
  locationId: string | null;
} {
  const id = b.targetId ?? null;
  const t = b.targetType ?? null;
  return {
    projectId: t === "project" ? id : null,
    bookingId: t === "booking" ? id : null,
    largeProjectId: t === "large_project" ? id : null,
    locationId: t === "location" || t === "warehouse" ? id : null,
  };
}

export function mapReportBlocksToSegments(
  rawBlocks: unknown,
  opts: { now?: Date } = {},
): MobileSegment[] {
  if (!Array.isArray(rawBlocks)) return [];
  const now = opts.now ?? new Date();
  const out: MobileSegment[] = [];
  for (const raw of rawBlocks) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as RawBlock;
    if (!b.startAt || !b.endAt) continue;
    // Drop raw engine-debug kinds — admin web hides these too. They are
    // expected to already be absorbed in display_blocks_json; this is a
    // belt-and-suspenders guard so the mobile UI never shows
    // signal_gap / uncertain_transition / micro_movement chains.
    if (b.kind && HIDDEN_RAW_KINDS.has(String(b.kind))) {
      continue;
    }
    // Sanity guard: drop ghost segments > 18h. These are almost always old
    // un-closed workdays/timers that leaked through the cache.
    const startMsCheck = new Date(b.startAt).getTime();
    const endMsCheck = new Date(b.endAt).getTime();
    if (
      Number.isFinite(startMsCheck) && Number.isFinite(endMsCheck) &&
      endMsCheck - startMsCheck > 18 * 60 * 60 * 1000
    ) {
      console.warn("[mapReportBlocksToSegments] dropping ghost segment >18h", {
        id: b.id, startAt: b.startAt, endAt: b.endAt,
        durationMinutes: b.durationMinutes,
      });
      continue;
    }
    const kind = pickKind(b);
    const refs = refsFor(b);
    // Prefer engine-provided displayLabel (admin web uses the same field) so
    // mobile and admin stay in lockstep. Fallback chain matches admin.
    const label = b.displayLabel ?? b.targetLabel ?? b.title ?? "Okänt";
    const dur = Number(b.durationMinutes ?? 0);
    // Treat last block whose endAt is in the future or within 90s of now as "active".
    const endMs = new Date(b.endAt).getTime();
    const isActive = !Number.isFinite(endMs) || endMs >= now.getTime() - 90_000;
    // Build a single human warning label out of warningReasons when the
    // engine didn't provide a pre-formatted warningLabel. Reasons remain
    // metadata only — never their own segment.
    const warningLabel = b.warningLabel
      ?? (Array.isArray(b.warningReasons) && b.warningReasons.length > 0
        ? b.warningReasons.slice(0, 2).join(" • ")
        : null);
    out.push({
      id: String(b.id ?? `${b.startAt}-${b.endAt}`),
      kind,
      label,
      startedAt: b.startAt,
      endedAt: b.endAt,
      durationMinutes: Math.max(0, Math.round(dur)),
      isActive: isActive && kind !== "break",
      confidence: asConfidence(b.confidence),
      statusLabel: statusLabelFor(b, kind),
      warningLabel,
      projectId: refs.projectId,
      bookingId: refs.bookingId,
      largeProjectId: refs.largeProjectId,
      locationId: refs.locationId,
      sourceBlockId: String(b.id ?? ""),
    });
  }
  // Only the last segment (chronologically) may be active.
  if (out.length > 0) {
    const lastIdx = out.length - 1;
    for (let i = 0; i < out.length; i++) {
      if (i !== lastIdx) out[i].isActive = false;
    }
  }
  return out;
}
