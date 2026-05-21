// Auto-apply-policy. Endast 4 säkra regler får apply utan godkännande.
// Allt annat → suggestion-rad, ingen mutation.

import type { AiReviewOutput } from "./schema.ts";

export const ALLOWED_AUTO_APPLY_RULES = new Set([
  "geofence_exit_trim_10min",
  "geofence_enter_extend_10min",
  "merge_same_target_gap_5min",
  "unknown_target_inside_geofence",
]);

export interface ApplyContext {
  blockId: string;
  staffId: string;
  organizationId: string;
  reportDate: string;
  currentBlock: {
    start_time: string | null;
    end_time: string | null;
    approved: boolean | null;
    is_subdivision: boolean | null;
    booking_id: string | null;
    large_project_id: string | null;
    location_id: string | null;
  };
}

export interface ApplyDecision {
  allowed: boolean;
  reason?: string;
  patch?: Record<string, unknown>;
  undoPayload?: Record<string, unknown>;
}

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function diffMinutes(a: string, b: string): number {
  const toM = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.abs(toM(a) - toM(b));
}

export function evaluateAutoApply(
  output: AiReviewOutput,
  ctx: ApplyContext,
): ApplyDecision {
  // Absoluta säkerhetsspärrar
  if (ctx.currentBlock.approved) {
    return { allowed: false, reason: "approved_lock" };
  }
  if (ctx.currentBlock.is_subdivision) {
    return { allowed: false, reason: "subdivision_no_apply" };
  }
  if (output.verdict !== "auto_apply") {
    return { allowed: false, reason: "verdict_not_auto_apply" };
  }
  if (output.confidence < 0.85) {
    return { allowed: false, reason: "confidence_too_low" };
  }
  const rule = output.action?.apply_rule ?? null;
  if (!rule || !ALLOWED_AUTO_APPLY_RULES.has(rule)) {
    return { allowed: false, reason: "rule_not_in_allowlist" };
  }
  const a = output.action!;

  // Trim rules: max 10 min skiftning
  if (rule === "geofence_exit_trim_10min") {
    const newEnd = a.suggested_end_time;
    const oldEnd = ctx.currentBlock.end_time;
    if (!newEnd || !oldEnd || !TIME_RE.test(newEnd)) {
      return { allowed: false, reason: "bad_time_format" };
    }
    if (diffMinutes(newEnd, oldEnd) > 10) {
      return { allowed: false, reason: "trim_exceeds_10min" };
    }
    return {
      allowed: true,
      patch: { end_time: newEnd },
      undoPayload: { end_time: oldEnd },
    };
  }

  if (rule === "geofence_enter_extend_10min") {
    const newStart = a.suggested_start_time;
    const oldStart = ctx.currentBlock.start_time;
    if (!newStart || !oldStart || !TIME_RE.test(newStart)) {
      return { allowed: false, reason: "bad_time_format" };
    }
    if (diffMinutes(newStart, oldStart) > 10) {
      return { allowed: false, reason: "extend_exceeds_10min" };
    }
    return {
      allowed: true,
      patch: { start_time: newStart },
      undoPayload: { start_time: oldStart },
    };
  }

  if (rule === "unknown_target_inside_geofence") {
    if (ctx.currentBlock.booking_id || ctx.currentBlock.large_project_id) {
      return { allowed: false, reason: "target_already_set" };
    }
    const lp = a.target_project_id;
    if (!lp) return { allowed: false, reason: "no_target_project" };
    return {
      allowed: true,
      patch: { large_project_id: lp },
      undoPayload: {
        large_project_id: null,
        booking_id: ctx.currentBlock.booking_id,
        location_id: ctx.currentBlock.location_id,
      },
    };
  }

  if (rule === "merge_same_target_gap_5min") {
    // Hanteras separat: AI:n returnerar suggested_end_time = nästa blocks slut.
    // Sammanslagning kräver DELETE av nästa block — vi gör det INTE auto-apply
    // utan låter det bli en suggestion även här (extra säkerhet).
    return { allowed: false, reason: "merge_requires_human_for_now" };
  }

  return { allowed: false, reason: "unhandled_rule" };
}
