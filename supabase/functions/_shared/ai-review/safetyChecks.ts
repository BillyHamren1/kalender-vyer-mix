// Safety-checks som blockerar auto-apply. Returnerar lista flaggor.
import {
  AI_THRESHOLD_DEFAULT,
  AI_THRESHOLD_WORK_NO_ASSIGNMENT,
  ALLOWED_AI_KINDS,
  type AiSuggestion,
} from "./types.ts";

export interface SafetyContext {
  block: {
    kind: string;
    durationMinutes: number;
    targetId?: string | null;
    targetType?: string | null;
    targetLabel?: string | null;
    fromLabel?: string | null;
    toLabel?: string | null;
  };
  hasHomePrivateConflict: boolean;
  hasDirectAssignment: boolean;
  hasStrongTransportEvidence: boolean;
}

export function evaluateSafetyFlags(
  ai: AiSuggestion,
  ctx: SafetyContext,
): string[] {
  const flags: string[] = [...(ai.safetyFlags ?? [])];
  if (ai.suggestedKind === "needs_review") flags.push("ai_returned_needs_review");
  if (!ALLOWED_AI_KINDS.has(ai.suggestedKind as never)) flags.push("disallowed_kind");
  if (typeof ai.confidenceScore !== "number" || ai.confidenceScore < AI_THRESHOLD_DEFAULT) {
    flags.push("below_default_threshold");
  }
  if (ai.suggestedKind === "work") {
    if (!ctx.hasDirectAssignment && ai.confidenceScore < AI_THRESHOLD_WORK_NO_ASSIGNMENT) {
      flags.push("work_without_assignment_below_0_85");
    }
    if (!ctx.block.targetId) flags.push("work_without_target");
    if (ctx.hasHomePrivateConflict) flags.push("home_or_private_conflict");
  }
  if (ai.suggestedKind === "transport" && ctx.hasHomePrivateConflict) {
    flags.push("home_or_private_conflict");
  }
  if (!ctx.block.durationMinutes || ctx.block.durationMinutes <= 0) {
    flags.push("non_positive_duration");
  }
  if (ai.suggestedKind === "transport" && !ctx.hasStrongTransportEvidence) {
    // Tillåt — men markera så att operatör kan se det. Inte blockerande.
  }
  return Array.from(new Set(flags));
}

export function shouldAutoApply(
  ai: AiSuggestion,
  flags: string[],
): boolean {
  if (flags.length > 0) return false;
  if (ai.suggestedKind === "needs_review") return false;
  if (!ALLOWED_AI_KINDS.has(ai.suggestedKind as never)) return false;
  if (ai.confidenceScore < AI_THRESHOLD_DEFAULT) return false;
  return true;
}
