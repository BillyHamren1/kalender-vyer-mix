// analyze-time-report-block
// ─────────────────────────────────────────────────────────────────────────────
// AI-granskning av OSÄKRA tidrapportblock i admin-vyn /staff-management/time-reports.
//
// Hårda kontrakter:
//   - AI får ALDRIG ändra time_reports / workdays / location_time_entries /
//     travel_time_logs / gps_pings / active_time_registrations.
//   - AI får ALDRIG auto-applicera. shouldAutoApply tvingas alltid till false.
//   - AI skriver ENDAST till tabellen time_report_ai_reviews.
//   - AI returnerar förslag + motivering + evidens — inget mer.
//
// Input (POST):
//   {
//     organizationId, staffId, date, blockId, engineVersion?,
//     blockSnapshot: { kind, startAt, endAt, durationMinutes, title, subtitle?,
//                      fromLabel?, toLabel?, confidence, reviewState,
//                      reviewReasons?, targetType?, targetLabel?,
//                      signalGapMinutes?, evidenceSummary? },
//     contextSnapshot?: {
//       previousBlock?: { kind, title, endAt, targetLabel? },
//       nextBlock?:     { kind, title, startAt, targetLabel? },
//       nearbyTargets?: Array<{ name: string; type: string; distanceMeters?: number }>,
//       gpsAroundBlock?: Array<{ ts: string; lat?: number; lng?: number; speedKph?: number }>,
//     },
//     dryRun?: boolean
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

const ALLOWED_CLASSIFICATIONS = new Set([
  "work",
  "transport",
  "unknown",
  "break",
  "private",
  "exclude_from_report",
  "needs_human_review",
]);

const ALLOWED_ACTION_TYPES = new Set([
  "mark_as_transport",
  "mark_as_work",
  "exclude_pre_work",
  "keep_needs_review",
  "request_user_input",
  "merge_with_previous",
  "merge_with_next",
]);

const ALLOWED_CONFIDENCE = new Set(["very_high", "high", "medium", "low"]);

interface BlockSnapshot {
  kind: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title?: string;
  subtitle?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  confidence?: string;
  reviewState?: string;
  reviewReasons?: string[];
  targetType?: string | null;
  targetLabel?: string | null;
  signalGapMinutes?: number;
  evidenceSummary?: Record<string, unknown> | null;
}

interface ContextSnapshot {
  previousBlock?: Record<string, unknown> | null;
  nextBlock?: Record<string, unknown> | null;
  nearbyTargets?: Array<Record<string, unknown>>;
  gpsAroundBlock?: Array<Record<string, unknown>>;
}

interface AnalyzeRequest {
  organizationId: string;
  staffId: string;
  date: string;
  blockId: string;
  engineVersion?: string;
  blockSnapshot: BlockSnapshot;
  contextSnapshot?: ContextSnapshot;
  dryRun?: boolean;
}

interface AiReview {
  suggestedClassification: string;
  suggestedKind?: string;
  suggestedLabel: string;
  suggestedMinutes?: number;
  confidence: "very_high" | "high" | "medium" | "low";
  confidenceScore: number;
  reasoningSummary: string;
  evidenceUsed: string[];
  concerns: string[];
  suggestedAction: { actionType: string; payload: Record<string, unknown> };
  shouldAutoApply: false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = (await req.json().catch(() => null)) as Partial<AnalyzeRequest> | null;
    if (!body?.organizationId || !body.staffId || !body.date || !body.blockId || !body.blockSnapshot) {
      return json({ error: "organizationId, staffId, date, blockId, blockSnapshot required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Auth: admin i samma org
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: prof } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prof || prof.organization_id !== body.organizationId) {
      return json({ error: "forbidden_org" }, 403);
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden_role" }, 403);

    // Verifiera att staffId tillhör samma org
    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, organization_id")
      .eq("id", body.staffId)
      .maybeSingle();
    if (!sm || sm.organization_id !== body.organizationId) {
      return json({ error: "forbidden_staff" }, 403);
    }

    // ── Bygg AI-prompt ────────────────────────────────────────────────────
    const aiResultRaw = await callAi(body.blockSnapshot, body.contextSnapshot ?? {});
    const review = sanitize(aiResultRaw);

    if (body.dryRun === true) {
      return json({ dryRun: true, review });
    }

    // Spara review
    const { data: inserted, error: insErr } = await supabase
      .from("time_report_ai_reviews")
      .insert({
        organization_id: body.organizationId,
        staff_id: body.staffId,
        date: body.date,
        block_id: body.blockId,
        engine_version: body.engineVersion ?? null,
        review_status: "suggested",
        current_classification: body.blockSnapshot.kind,
        current_kind: body.blockSnapshot.kind,
        current_confidence: body.blockSnapshot.confidence ?? null,
        suggested_classification: review.suggestedClassification,
        suggested_kind: review.suggestedKind ?? review.suggestedClassification,
        suggested_label: review.suggestedLabel,
        suggested_minutes: review.suggestedMinutes ?? null,
        confidence: review.confidence,
        confidence_score: review.confidenceScore,
        reasoning_summary: review.reasoningSummary,
        evidence_json: {
          blockSnapshot: body.blockSnapshot,
          contextSnapshot: body.contextSnapshot ?? null,
        },
        suggested_action_json: review.suggestedAction,
        concerns_json: review.concerns,
        evidence_used_json: review.evidenceUsed,
        ai_model: MODEL,
      })
      .select("*")
      .single();

    if (insErr) {
      console.error("[analyze-time-report-block] insert error", insErr);
      return json({ error: "insert_failed", detail: insErr.message }, 500);
    }

    return json({ review, row: inserted });
  } catch (err) {
    console.error("[analyze-time-report-block] error", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(raw: Partial<AiReview>): AiReview {
  const cls = String(raw.suggestedClassification ?? "needs_human_review");
  const conf = String(raw.confidence ?? "low");
  const action = raw.suggestedAction ?? { actionType: "keep_needs_review", payload: {} };
  return {
    suggestedClassification: ALLOWED_CLASSIFICATIONS.has(cls) ? cls : "needs_human_review",
    suggestedKind: typeof raw.suggestedKind === "string" ? raw.suggestedKind : undefined,
    suggestedLabel: String(raw.suggestedLabel ?? "AI kunde inte bedöma blocket"),
    suggestedMinutes:
      typeof raw.suggestedMinutes === "number" && Number.isFinite(raw.suggestedMinutes)
        ? Math.max(0, Math.round(raw.suggestedMinutes))
        : undefined,
    confidence: (ALLOWED_CONFIDENCE.has(conf) ? conf : "low") as AiReview["confidence"],
    confidenceScore: clamp01(Number(raw.confidenceScore ?? 0)),
    reasoningSummary: String(raw.reasoningSummary ?? ""),
    evidenceUsed: Array.isArray(raw.evidenceUsed) ? raw.evidenceUsed.map(String).slice(0, 20) : [],
    concerns: Array.isArray(raw.concerns) ? raw.concerns.map(String).slice(0, 20) : [],
    suggestedAction: {
      actionType: ALLOWED_ACTION_TYPES.has(String(action.actionType))
        ? String(action.actionType)
        : "keep_needs_review",
      payload: typeof action.payload === "object" && action.payload != null
        ? action.payload as Record<string, unknown>
        : {},
    },
    shouldAutoApply: false,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function callAi(block: BlockSnapshot, ctx: ContextSnapshot): Promise<Partial<AiReview>> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = [
    "Du är en analysator av OSÄKRA tidrapportblock för fältpersonal.",
    "Du får data om ETT block (klassning, tider, evidens, grannblock, ev. GPS).",
    "Din uppgift: föreslå korrekt tolkning, motivering, confidence, åtgärd.",
    "",
    "FÖRBJUDET:",
    " - Du ändrar ingenting själv. Allt du föreslår är RÅDGIVANDE.",
    " - Du får ALDRIG sätta shouldAutoApply till true.",
    " - Du får ALDRIG hitta på platser eller projekt som inte nämns i input.",
    " - Du får ALDRIG dra av lönegrundande tid utan tydlig evidens.",
    "",
    "Föreslagna klassificeringar (välj exakt en):",
    "  work | transport | unknown | break | private | exclude_from_report | needs_human_review",
    "",
    "Föreslagna åtgärder (välj exakt en):",
    "  mark_as_transport | mark_as_work | exclude_pre_work | keep_needs_review",
    "  | request_user_input | merge_with_previous | merge_with_next",
    "",
    "Confidence: very_high | high | medium | low. Vid tvekan → low + needs_human_review.",
    "",
    "── CASE 1: GPS-GAP MITT I PÅGÅENDE RESA ─────────────────────────────",
    "Om alla följande är sanna ska du föreslå suggestedClassification='transport',",
    "suggestedAction.actionType='mark_as_transport', confidence='high' (eller 'very_high'",
    "om mycket starkt stöd):",
    "  a) Det aktuella blocket är ett kort signalglapp (oftast < 30 min,",
    "     context.signalGapMinutes eller block.signalGapMinutes > 0,",
    "     eller engineReviewReasons innehåller 'signal_gap'/'gps_gap'/'unclear_transport').",
    "  b) previousBlock.kind === 'transport' ELLER nextBlock.kind === 'transport'",
    "     (resa pågick precis innan eller fortsätter precis efter).",
    "  c) Det finns minst 1 egen GPS-ping i context.gpsBeforeGap OCH minst 1 egen ping",
    "     i context.gpsAfterGap (telefonen var på, signalen tappades bara kort).",
    "  d) nextBlock leder till en känd arbetsrelaterad destination",
    "     (nextBlock.targetType i {'organization_location','project','booking','warehouse'}",
    "     ELLER nextBlock.kind === 'work').",
    "Motivering ska då följa mönstret:",
    "  \"GPS saknades kort under en pågående resa. Personen hade egen ping före och efter",
    "   gapet och resan fortsatte mot känd arbetsrelaterad destination.\"",
    "Lägg in i evidenceUsed: 'gps_pings_before_gap', 'gps_pings_after_gap',",
    "'previous_or_next_block_is_transport', 'destination_known_workplace'.",
    "Sätt suggestedAction.payload till { mergeWith: 'previous'|'next', reason: 'gps_gap_in_transport' }.",
    "",
    "Om något av a–d saknas: föreslå needs_human_review eller unknown med motivering.",
    "",
    "Returnera ALLTID via verktygsanropet propose_block_review.",
  ].join("\n");

  const userPayload = {
    block,
    context: {
      previousBlock: ctx.previousBlock ?? null,
      nextBlock: ctx.nextBlock ?? null,
      nearbyTargets: (ctx.nearbyTargets ?? []).slice(0, 8),
      gpsAroundBlock: (ctx.gpsAroundBlock ?? []).slice(0, 50),
    },
  };

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    tools: [{
      type: "function",
      function: {
        name: "propose_block_review",
        description: "Returnerar AI-förslag för ett osäkert tidrapportblock.",
        parameters: {
          type: "object",
          properties: {
            suggestedClassification: {
              type: "string",
              enum: [...ALLOWED_CLASSIFICATIONS],
            },
            suggestedKind: { type: "string" },
            suggestedLabel: { type: "string" },
            suggestedMinutes: { type: "number", minimum: 0 },
            confidence: { type: "string", enum: [...ALLOWED_CONFIDENCE] },
            confidenceScore: { type: "number", minimum: 0, maximum: 1 },
            reasoningSummary: { type: "string" },
            evidenceUsed: { type: "array", items: { type: "string" } },
            concerns: { type: "array", items: { type: "string" } },
            suggestedAction: {
              type: "object",
              properties: {
                actionType: { type: "string", enum: [...ALLOWED_ACTION_TYPES] },
                payload: { type: "object", additionalProperties: true },
              },
              required: ["actionType"],
            },
          },
          required: [
            "suggestedClassification",
            "suggestedLabel",
            "confidence",
            "confidenceScore",
            "reasoningSummary",
            "suggestedAction",
          ],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "propose_block_review" } },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) throw new Error("ai_rate_limited");
  if (resp.status === 402) throw new Error("ai_payment_required");
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ai_gateway_error_${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    return {
      suggestedClassification: "needs_human_review",
      suggestedLabel: "AI kunde inte tolka blocket",
      confidence: "low",
      confidenceScore: 0,
      reasoningSummary: "AI returnerade inget verktygssvar.",
      evidenceUsed: [],
      concerns: ["no_tool_response"],
      suggestedAction: { actionType: "keep_needs_review", payload: {} },
    };
  }
  try {
    return JSON.parse(args) as Partial<AiReview>;
  } catch {
    return {
      suggestedClassification: "needs_human_review",
      suggestedLabel: "AI returnerade ogiltigt JSON",
      confidence: "low",
      confidenceScore: 0,
      reasoningSummary: "AI-svar kunde inte parsas.",
      evidenceUsed: [],
      concerns: ["bad_json"],
      suggestedAction: { actionType: "keep_needs_review", payload: {} },
    };
  }
}
