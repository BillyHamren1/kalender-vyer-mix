// buildNeedsReviewFallbackBlocks
// ─────────────────────────────────
// PURE helper. No DB access. No Date.now. No mutation of input.
//
// Bakgrund (Time Engine cache fallback v1):
//   När Time Engine producerar `display_blocks_json = []` men
//   `report_candidate_blocks_json` har innehåll (t.ex. bara
//   signal_gap/transport/unknown_place — inga work-block) renderas mobilens
//   tidslinje tom. Det är förvirrande för användaren eftersom GPS-pings
//   tydligt finns hela dagen.
//
// Den här helpern är en RENDER-fallback (ingen klassningsändring): den tar
// kandidatblocken och returnerar en syntetisk display-array där varje
// renderbart segment markeras med `kind: 'needs_review'` så att
// `mapReportBlocksToSegments` visar dem som "Behöver granskas" i mobilen.
//
// Reglerna:
//   - Endast block med startAt+endAt+kind tas med.
//   - signal_gap / uncertain_transition / missing_transition_evidence
//     droppas (de filtreras bort i mappern ändå).
//   - Övriga (transport, unknown_place, work utan target, ...) marknadsförs
//     som `needs_review` med `reviewState='needs_review'` och bevarad
//     start/end/duration/label.
//   - INGEN ändring av `report_candidate_blocks_json` i DB:n. Bara mirror-
//     svaret påverkas.
//   - Markerar varje block med `_provisionalFromCandidates: true` så att
//     downstream summerare aldrig av misstag räknar fallbacken som lönegrundande.

const DROP_KINDS = new Set<string>([
  "signal_gap",
  "uncertain_transition",
  "missing_transition_evidence",
  "micro_movement",
  "internal_transport",
]);

interface CandidateLike {
  id?: string;
  kind?: string;
  startAt?: string;
  endAt?: string;
  durationMinutes?: number;
  title?: string;
  displayLabel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  confidence?: string;
  warningReasons?: string[];
}

export interface NeedsReviewFallbackResult {
  blocks: any[];
  /** Antal kandidatblock som droppades pga DROP_KINDS eller saknade tider. */
  droppedCount: number;
  /** Totalt antal candidate-block in. */
  candidateCount: number;
}

export function buildNeedsReviewFallbackBlocks(
  candidates: unknown,
): NeedsReviewFallbackResult {
  if (!Array.isArray(candidates)) {
    return { blocks: [], droppedCount: 0, candidateCount: 0 };
  }
  const out: any[] = [];
  let dropped = 0;
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") {
      dropped++;
      continue;
    }
    const b = raw as CandidateLike;
    const kind = String(b.kind ?? "");
    if (!b.startAt || !b.endAt) {
      dropped++;
      continue;
    }
    if (DROP_KINDS.has(kind)) {
      dropped++;
      continue;
    }
    const label =
      b.displayLabel ??
      b.targetLabel ??
      b.title ??
      (kind === "transport" ? "Resa (oklart)" : "Oklar plats");
    out.push({
      id: b.id ?? `fallback-${b.startAt}-${b.endAt}`,
      kind: "needs_review",
      reviewState: "needs_review",
      startAt: b.startAt,
      endAt: b.endAt,
      durationMinutes: Number(b.durationMinutes ?? 0),
      title: label,
      displayLabel: label,
      targetType: b.targetType ?? null,
      targetId: b.targetId ?? null,
      targetLabel: b.targetLabel ?? null,
      confidence: b.confidence ?? "low",
      warningReasons: Array.isArray(b.warningReasons) ? b.warningReasons : [],
      _provisionalFromCandidates: true,
      _originKind: kind,
    });
  }
  return {
    blocks: out,
    droppedCount: dropped,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
  };
}
