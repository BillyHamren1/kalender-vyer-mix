// Frontend-spegling av AI-review-typer.
// Importeras av UI-komponenter som visar AI-chips och decision trace.

export type AiReviewStatus =
  | "not_reviewed"
  | "auto_applied"
  | "uncertain"
  | "skipped"
  | "failed";

export type AiConfidenceLabel = "very_high" | "high" | "medium" | "low";

export interface AiReviewMeta {
  reviewed: boolean;
  status: AiReviewStatus;
  confidenceScore: number;
  confidenceLabel: AiConfidenceLabel;
  originalKind: string;
  originalReviewState: string;
  originalLabel: string;
  aiKind: string;
  aiLabel: string;
  aiClassification: string;
  reasoningSummary: string;
  evidenceUsed: string[];
  concerns: string[];
  reviewedAt: string;
  modelVersion: string;
  auditId?: string | null;
}

export function aiReviewChipLabel(meta: AiReviewMeta | null | undefined): string | null {
  if (!meta?.reviewed) return null;
  if (meta.status === "auto_applied") return "AI-klassad";
  if (meta.status === "uncertain") return "AI osäker";
  return null;
}

export function aiReviewChipTooltip(meta: AiReviewMeta | null | undefined): string | null {
  if (!meta?.reviewed) return null;
  const pct = Math.round((meta.confidenceScore ?? 0) * 100);
  if (meta.status === "auto_applied") {
    return `AI klassade detta block med ${pct}% sannolikhet som ${meta.aiKind}.`;
  }
  if (meta.status === "uncertain") {
    return `AI är osäker (${pct}%). ${meta.reasoningSummary || ""}`.trim();
  }
  return null;
}
