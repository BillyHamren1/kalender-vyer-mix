// Pure mapper: report_candidate_blocks_json (Time Engine cache) → MobileSegment[].
// No DB access. Frontend and the edge function MUST go through this mapper —
// the mobile UI never re-interprets blocks.
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
  signalGapMinutes?: number;
}

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
    const kind = pickKind(b);
    const refs = refsFor(b);
    const label = b.targetLabel ?? b.title ?? "Okänt";
    const dur = Number(b.durationMinutes ?? 0);
    // Treat last block whose endAt is in the future or within 90s of now as "active".
    const endMs = new Date(b.endAt).getTime();
    const isActive = !Number.isFinite(endMs) || endMs >= now.getTime() - 90_000;
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
      warningLabel: b.warningLabel ?? null,
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
