// JSON-schema (OpenAI-tool-calling-format) för structured output.
// Mirroras av Zod-validator i runtime nedan för säker parse.

export const EMIT_REVIEW_TOOL = {
  type: "function",
  function: {
    name: "emit_review",
    description: "Returnera strukturerad bedömning av tidsblocket.",
    parameters: {
      type: "object",
      properties: {
        verdict: {
          type: "string",
          enum: ["clean", "wait_for_next", "suggested", "auto_apply", "error"],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasoning: { type: "string", description: "≤ 3 meningar på svenska." },
        action: {
          type: "object",
          description: "Förslag/justering. Krävs för suggested+auto_apply.",
          properties: {
            suggestion_type: {
              type: "string",
              enum: [
                "trim_start",
                "trim_end",
                "extend_start",
                "extend_end",
                "merge_with_next",
                "split_block",
                "change_target_to_project",
                "change_target_to_location",
                "classify_as_travel",
                "classify_as_private",
                "delete_block",
                "needs_user_input",
              ],
            },
            suggested_start_time: { type: ["string", "null"] },
            suggested_end_time: { type: ["string", "null"] },
            target_project_id: { type: ["string", "null"] },
            target_location_id: { type: ["string", "null"] },
            target_booking_id: { type: ["string", "null"] },
            apply_rule: {
              type: ["string", "null"],
              enum: [
                null,
                "geofence_exit_trim_10min",
                "geofence_enter_extend_10min",
                "merge_same_target_gap_5min",
                "unknown_target_inside_geofence",
              ],
              description: "Satt endast vid verdict=auto_apply.",
            },
            human_readable: { type: "string" },
          },
          required: ["suggestion_type", "human_readable"],
        },
        rule_learned: {
          type: ["object", "null"],
          description: "Sätt om du upptäcker ett nytt återkommande mönster.",
          properties: {
            scope: { type: "string", enum: ["staff", "project", "staff_project", "org"] },
            pattern_type: { type: "string" },
            human_readable: { type: "string" },
            pattern_data: { type: "object" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["scope", "pattern_type", "human_readable"],
        },
      },
      required: ["verdict", "confidence", "reasoning"],
      additionalProperties: false,
    },
  },
} as const;

export type ReviewVerdict =
  | "clean"
  | "wait_for_next"
  | "suggested"
  | "auto_apply"
  | "error";

export interface AiReviewOutput {
  verdict: ReviewVerdict;
  confidence: number;
  reasoning: string;
  action?: {
    suggestion_type: string;
    suggested_start_time?: string | null;
    suggested_end_time?: string | null;
    target_project_id?: string | null;
    target_location_id?: string | null;
    target_booking_id?: string | null;
    apply_rule?: string | null;
    human_readable: string;
  };
  rule_learned?: {
    scope: "staff" | "project" | "staff_project" | "org";
    pattern_type: string;
    human_readable: string;
    pattern_data?: Record<string, unknown>;
    confidence?: number;
  } | null;
}

export function validateAiOutput(raw: unknown): AiReviewOutput {
  if (!raw || typeof raw !== "object") throw new Error("ai_output_not_object");
  const o = raw as Record<string, unknown>;
  const verdict = String(o.verdict ?? "");
  if (!["clean", "wait_for_next", "suggested", "auto_apply", "error"].includes(verdict))
    throw new Error(`bad_verdict:${verdict}`);
  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    throw new Error("bad_confidence");
  const reasoning = String(o.reasoning ?? "").slice(0, 1000);
  return {
    verdict: verdict as ReviewVerdict,
    confidence,
    reasoning,
    action: (o.action as AiReviewOutput["action"]) ?? undefined,
    rule_learned: (o.rule_learned as AiReviewOutput["rule_learned"]) ?? null,
  };
}
