// Tidrapport AI 1 — gemensamma typer + policy-konstanter.
// Speglas av src/lib/staff/aiReview.ts (frontend).

export type AiReviewStatus =
  | "not_reviewed"
  | "auto_applied"
  | "uncertain"
  | "skipped"
  | "failed";

export type AiConfidenceLabel = "very_high" | "high" | "medium" | "low";

export type AiAllowedKind =
  | "transport"
  | "work"
  | "exclude_from_report"
  | "unknown"
  | "break"
  | "private";

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

export interface AiSuggestion {
  suggestedKind: AiAllowedKind | "needs_review";
  suggestedLabel: string;
  confidenceScore: number;
  confidenceLabel: AiConfidenceLabel;
  reasoningSummary: string;
  evidenceUsed: string[];
  concerns: string[];
  safetyFlags: string[];
  shouldAutoApply: boolean;
}

export const AI_THRESHOLD_DEFAULT = 0.75;
export const AI_THRESHOLD_WORK_NO_ASSIGNMENT = 0.85;

export const ALLOWED_AI_KINDS: ReadonlySet<AiAllowedKind> = new Set([
  "transport",
  "work",
  "exclude_from_report",
  "unknown",
  "break",
  "private",
]);

export function confidenceLabel(score: number): AiConfidenceLabel {
  if (score >= 0.9) return "very_high";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}
