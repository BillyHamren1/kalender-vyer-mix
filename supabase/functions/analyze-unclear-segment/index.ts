// analyze-unclear-segment
// ─────────────────────────────────────────────────────────────────────────────
// Backend AI för OKLARA plats-/rörelsesegment.
//
// Hård regel:
//   AI ersätter ALDRIG regelmotorn. AI kallas bara på segment som motorn redan
//   har klassat som ett av:
//     - other_place              (stationärt utanför kända platser)
//     - unclear_transport        (rörelse utan känt mål)
//     - unclear_movement         (rörelsemönster motorn inte tolkar)
//     - gps_gap_in_workday       (GPS-gap inom pågående arbetsdag)
//
// Avvisas (hårt 422) om segmentet är:
//     - confirmed_project / confirmed_warehouse
//     - tydlig arbetsplats (matched booking/project/location)
//     - låst/godkänd dag
//
// AI får endast föreslå:
//     - other_place
//     - transport
//     - needs_user_input
//
// AI får ALDRIG dra av tid (inga rast-/privatavdrag, ingen minskad lönegrund).
// AI:s output är pure metadata + ev. fråga till användaren.
//
// Cache: per (staff_id, segment_id) i unclear_segment_ai_analyses.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logDayDecision, enqueueDayRebuild } from "../_shared/day-decision-audit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

// ─── Tillåtna kategorier ────────────────────────────────────────────────────
const ANALYZABLE_KINDS = new Set([
  "other_place",
  "unclear_transport",
  "unclear_movement",
  "gps_gap_in_workday",
]);

const REJECTED_KINDS = new Set([
  "confirmed_project",
  "confirmed_warehouse",
  "matched_booking",
  "matched_project",
  "matched_location",
  "matched_home",
  "approved_day",
  "locked_day",
]);

const ALLOWED_SUGGESTIONS = new Set(["other_place", "transport", "needs_user_input"]);

interface SegmentInput {
  segment_id: string;          // stabilt id (samma input → samma id)
  kind: string;                // klassning från regelmotorn
  start_ts: string;
  end_ts: string;
  duration_min: number;
  center_lat?: number | null;
  center_lng?: number | null;
  is_stationary?: boolean;
  ping_count?: number;
  // Kontext (ENDAST för AI:s resonemang — AI får inte ändra dessa)
  nearby_known_places?: Array<{ name: string; type: string; distance_m: number }>;
  preceding_segment_kind?: string | null;
  following_segment_kind?: string | null;
  workday_active?: boolean;
  approx_address?: string | null;
}

interface AnalyzeRequest {
  staff_id: string;
  date: string;
  segment: SegmentInput;
  force?: boolean;
}

interface TrackingPolicyRecommendation {
  mode?: "low_power" | "normal" | "high_resolution";
  heartbeatMs?: number;
  reason?: string;
}

interface AiResult {
  suggestedType: "other_place" | "transport" | "needs_user_input";
  confidence: number;
  needsUserInput: boolean;
  userQuestion?: string;
  explanation: string;
  // Hard rule contract — never reduces payable time, never overrides rule engine.
  affectsPayableTime: false;
  // What the segment should remain as if AI is unsure / low confidence.
  // Defaults to "other_place" so that nothing is silently changed.
  keepAsType: "other_place" | "unclear_transport" | "unclear_movement" | "gps_gap_in_workday";
  trackingPolicyRecommendation?: TrackingPolicyRecommendation;
}

const CONFIDENCE_THRESHOLD = 0.6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = (await req.json().catch(() => ({}))) as Partial<AnalyzeRequest>;

    if (!body?.staff_id || !body?.date || !body?.segment) {
      return json({ error: "staff_id, date and segment required" }, 400);
    }
    const seg = body.segment;
    if (!seg.segment_id || !seg.kind || !seg.start_ts || !seg.end_ts) {
      return json({ error: "segment.segment_id, kind, start_ts, end_ts required" }, 400);
    }

    // ── HÅRDA SKYDDSGRINDAR (regelmotorn vinner) ───────────────────────────
    if (REJECTED_KINDS.has(seg.kind)) {
      return json({
        error: "segment_not_analyzable",
        reason: "rule_engine_already_decisive",
        kind: seg.kind,
      }, 422);
    }
    if (!ANALYZABLE_KINDS.has(seg.kind)) {
      return json({
        error: "segment_not_analyzable",
        reason: "kind_not_in_allowlist",
        kind: seg.kind,
        allowed: [...ANALYZABLE_KINDS],
      }, 422);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Auth — admin ELLER staff själv ELLER cron
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-engine-secret");
    const isCron = !!cronSecret && providedSecret === cronSecret;

    let orgId: string | undefined;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      if (!userData?.user) return json({ error: "unauthorized" }, 401);
      const userId = userData.user.id;

      const { data: prof } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      orgId = prof?.organization_id as string | undefined;
      if (!orgId) return json({ error: "no_org" }, 403);

      // staff_id måste tillhöra samma org
      const { data: sm } = await supabase
        .from("staff_members")
        .select("organization_id, user_id")
        .eq("id", body.staff_id)
        .maybeSingle();
      if (!sm || sm.organization_id !== orgId) return json({ error: "forbidden" }, 403);
    } else {
      const { data: sm } = await supabase
        .from("staff_members")
        .select("organization_id")
        .eq("id", body.staff_id)
        .maybeSingle();
      orgId = sm?.organization_id as string | undefined;
      if (!orgId) return json({ error: "no_org_for_staff" }, 403);
    }

    // ── Skydd: dagen får inte vara attesterad/låst ─────────────────────────
    const { data: att } = await supabase
      .from("day_attestations")
      .select("status, locked_at")
      .eq("staff_id", body.staff_id)
      .eq("date", body.date)
      .maybeSingle();
    if (att && (att.locked_at || ["attested", "locked", "approved"].includes(String(att.status)))) {
      return json({
        error: "segment_not_analyzable",
        reason: "day_locked_or_attested",
        status: att.status,
      }, 422);
    }

    // ── Cache ──────────────────────────────────────────────────────────────
    const inputHash = await sha256(JSON.stringify(stripVolatile(seg)));
    if (!body.force) {
      const { data: cached } = await supabase
        .from("unclear_segment_ai_analyses")
        .select("*")
        .eq("staff_id", body.staff_id)
        .eq("segment_id", seg.segment_id)
        .maybeSingle();
      if (cached && cached.input_hash === inputHash) {
        return json({
          cached: true,
          result: rowToResult(cached),
        });
      }
    }

    // ── AI-call (Lovable AI Gateway) ───────────────────────────────────────
    const aiResult = await callAi(seg);

    // ── Hård sanering av AI-output ─────────────────────────────────────────
    if (!ALLOWED_SUGGESTIONS.has(aiResult.suggestedType)) {
      // AI hallucinerade en otillåten kategori → tvinga needs_user_input
      aiResult.suggestedType = "needs_user_input";
      aiResult.needsUserInput = true;
      if (!aiResult.userQuestion) {
        aiResult.userQuestion = "Vad gjorde du under den här tiden?";
      }
    }
    aiResult.confidence = Math.max(0, Math.min(1, Number(aiResult.confidence) || 0));

    // Hard contract: AI får ALDRIG påverka lönegrundande tid.
    aiResult.affectsPayableTime = false;

    // Om AI är osäker (låg confidence eller needsUserInput) → behåll segment
    // som "other_place" (default) eller den ursprungliga oklara typen.
    // Caller får då aldrig ändra segmentet utan att fråga användaren.
    if (aiResult.confidence < CONFIDENCE_THRESHOLD || aiResult.needsUserInput) {
      aiResult.needsUserInput = true;
      aiResult.keepAsType = (seg.kind === "other_place"
        ? "other_place"
        : (seg.kind as AiResult["keepAsType"])) ?? "other_place";
      if (!aiResult.userQuestion) {
        aiResult.userQuestion = "Vad gjorde du under den här tiden?";
      }
    } else {
      // Hög confidence — behåll fortfarande som other_place tills user attesterar.
      aiResult.keepAsType = aiResult.keepAsType ?? "other_place";
    }

    // ── Persistera cache ───────────────────────────────────────────────────
    await supabase
      .from("unclear_segment_ai_analyses")
      .upsert({
        organization_id: orgId,
        staff_id: body.staff_id,
        segment_id: seg.segment_id,
        segment_date: body.date,
        segment_start_ts: seg.start_ts,
        segment_end_ts: seg.end_ts,
        segment_kind: seg.kind,
        suggested_type: aiResult.suggestedType,
        confidence: aiResult.confidence,
        needs_user_input: aiResult.needsUserInput,
        user_question: aiResult.userQuestion ?? null,
        explanation: aiResult.explanation,
        keep_as_type: aiResult.keepAsType,
        tracking_policy_recommendation: aiResult.trackingPolicyRecommendation ?? null,
        model: MODEL,
        input_hash: inputHash,
        updated_at: new Date().toISOString(),
      }, { onConflict: "staff_id,segment_id" });

    // ── Audit + rebuild ────────────────────────────────────────────────────
    await logDayDecision(supabase, {
      organizationId: orgId!,
      staffId: body.staff_id,
      dayDate: body.date,
      segmentId: seg.segment_id,
      actor: "ai",
      action: "ai_segment_analysis",
      before: { segment_kind: seg.kind },
      after: {
        suggestedType: aiResult.suggestedType,
        needsUserInput: aiResult.needsUserInput,
        userQuestion: aiResult.userQuestion ?? null,
      },
      reason: aiResult.explanation,
      confidence: aiResult.confidence,
      sourceFunction: "analyze-unclear-segment",
    });
    await enqueueDayRebuild(supabase, {
      organizationId: orgId!,
      staffId: body.staff_id,
      dayDate: body.date,
      reason: "ai_analysis",
      requestedBy: "analyze-unclear-segment",
    });

    return json({ cached: false, result: aiResult });
  } catch (err) {
    console.error("[analyze-unclear-segment] error", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

// ─── helpers ────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripVolatile(seg: SegmentInput) {
  // Cache-nyckel ska vara stabil — exkludera fält som kan vibrera
  // (ex. ping_count kan ändras med en ping). segment_id är redan stabilt.
  const { ping_count: _pc, ...rest } = seg;
  return rest;
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function rowToResult(row: Record<string, unknown>): AiResult {
  return {
    suggestedType: row.suggested_type as AiResult["suggestedType"],
    confidence: Number(row.confidence),
    needsUserInput: Boolean(row.needs_user_input),
    userQuestion: (row.user_question as string | null) ?? undefined,
    explanation: String(row.explanation ?? ""),
  };
}

async function callAi(seg: SegmentInput): Promise<AiResult> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = [
    "Du analyserar OKLARA plats-/rörelsesegment från GPS-data för fältpersonal.",
    "Du får ENDAST föreslå en av tre kategorier:",
    " - other_place: stationärt på en plats som inte är ett känt projekt/lager",
    " - transport: personen är på väg någonstans (bil, gång)",
    " - needs_user_input: går inte att avgöra med rimlig säkerhet — fråga användaren",
    "",
    "FÖRBJUDET:",
    " - Du får ALDRIG föreslå rastavdrag.",
    " - Du får ALDRIG föreslå att tid ska dras bort eller minskas.",
    " - Du får ALDRIG ändra confirmade projekt/lager — du analyserar bara det vi skickar.",
    " - Du får ALDRIG hitta på nya kategorier.",
    "",
    "Om du är osäker → använd needs_user_input och formulera EN kort fråga på svenska.",
    "Returnera ALLTID via verktygsanropet analyze_segment.",
  ].join("\n");

  const userPayload = {
    segment_kind_from_rule_engine: seg.kind,
    duration_minutes: seg.duration_min,
    is_stationary: seg.is_stationary ?? null,
    center_lat: seg.center_lat ?? null,
    center_lng: seg.center_lng ?? null,
    approx_address: seg.approx_address ?? null,
    nearby_known_places: seg.nearby_known_places ?? [],
    preceding_segment_kind: seg.preceding_segment_kind ?? null,
    following_segment_kind: seg.following_segment_kind ?? null,
    workday_active: seg.workday_active ?? null,
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
        name: "analyze_segment",
        description: "Returnerar AI-analys för ett oklart segment.",
        parameters: {
          type: "object",
          properties: {
            suggestedType: {
              type: "string",
              enum: ["other_place", "transport", "needs_user_input"],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            needsUserInput: { type: "boolean" },
            userQuestion: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["suggestedType", "confidence", "needsUserInput", "explanation"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "analyze_segment" } },
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
    throw new Error(`ai_gateway_error_${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argsRaw = toolCall?.function?.arguments;
  if (!argsRaw) {
    return {
      suggestedType: "needs_user_input",
      confidence: 0,
      needsUserInput: true,
      userQuestion: "Vad gjorde du under den här tiden?",
      explanation: "AI returnerade inget verktygssvar.",
    };
  }
  const parsed = JSON.parse(argsRaw) as AiResult;
  return parsed;
}
