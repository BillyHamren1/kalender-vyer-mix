// ai-review-time-report-blocks
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY AUDIT ONLY (Time Legacy Purge 2, 2026-05).
// Helautomatisk AI-granskning av oklara block i staff_day_report_cache.
// Triggas av DB-trigger trg_ai_review_time_report_blocks (pg_net) när cachen
// uppdateras med needs_review/unknown-block och dagen INTE är submitted/approved.
//
// Skriver ENBART till:
//   - staff_day_report_cache (report_candidate_blocks_json + summary_json
//     + ai_review_signature/at) — LEGACY-fält som inte längre används som
//     UI-källa i admin eller mobil.
//   - time_report_ai_block_audit (audit-rader markerade med
//     source='legacy_report_candidate_ai_review').
//
// FÅR ALDRIG skriva: display_blocks_json (DisplayTimelineV2 är canonical),
//   gps_pings, staff_location_history, time_reports, workdays,
//   location_time_entries, travel_time_logs, staff_day_submissions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  ALLOWED_AI_KINDS,
  confidenceLabel,
  type AiReviewMeta,
  type AiSuggestion,
} from "../_shared/ai-review/types.ts";
import { recalculateSummaryFromReportBlocks } from "../_shared/ai-review/recalcSummary.ts";
import { evaluateSafetyFlags, shouldAutoApply } from "../_shared/ai-review/safetyChecks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = "google/gemini-3-flash-preview";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Block {
  id: string;
  kind: string;
  reviewState: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  title?: string;
  subtitle?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  targetLabel?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  reviewReasons?: string[];
  aiReview?: AiReviewMeta | null;
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // Hård service-role-spärr (anropas bara av DB-trigger eller ops)
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return json(401, { error: "service_role_only" });
  }

  let body: { cacheId?: string; expectedSignature?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const cacheId = body?.cacheId;
  if (!cacheId) return json(400, { error: "missing_cacheId" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: cache, error: cacheErr } = await admin
    .from("staff_day_report_cache")
    .select("id, organization_id, staff_id, date, engine_version, report_candidate_blocks_json, summary_json, ai_review_signature")
    .eq("id", cacheId)
    .maybeSingle();
  if (cacheErr || !cache) return json(404, { error: "cache_not_found" });

  // Skydd: dag submitted/approved → skip
  const { data: submission } = await admin
    .from("staff_day_submissions")
    .select("status")
    .eq("organization_id", cache.organization_id)
    .eq("staff_id", cache.staff_id)
    .eq("date", cache.date)
    .maybeSingle();
  if (submission && ["submitted", "approved"].includes(String(submission.status))) {
    await admin.from("staff_day_report_cache")
      .update({ ai_review_pending: false })
      .eq("id", cache.id);
    return json(200, { ok: true, skipped: "day_locked" });
  }

  const blocks: Block[] = Array.isArray(cache.report_candidate_blocks_json)
    ? (cache.report_candidate_blocks_json as Block[])
    : [];

  const candidates = blocks.filter((b) =>
    b?.reviewState === "needs_review" ||
    b?.kind === "unknown" ||
    b?.kind === "needs_review"
  );

  if (candidates.length === 0) {
    await admin.from("staff_day_report_cache")
      .update({ ai_review_pending: false, ai_review_at: new Date().toISOString() })
      .eq("id", cache.id);
    return json(200, { ok: true, skipped: "no_candidates" });
  }

  const auditRows: Record<string, unknown>[] = [];
  const updatedBlocks: Block[] = blocks.slice();

  for (let i = 0; i < updatedBlocks.length; i++) {
    const block = updatedBlocks[i];
    if (!candidates.includes(block)) continue;

    const original = JSON.parse(JSON.stringify(block));
    let suggestion: AiSuggestion | null = null;
    let auditStatus: "auto_applied" | "uncertain" | "skipped" | "failed" = "skipped";
    let appliedKind: string = block.kind;

    try {
      suggestion = await callAi(block);
    } catch (e) {
      auditStatus = "failed";
      auditRows.push({
        organization_id: cache.organization_id,
        staff_id: cache.staff_id,
        date: cache.date,
        engine_version: cache.engine_version,
        cache_id: cache.id,
        block_id: block.id,
        status: "failed",
        original_block_json: original,
        ai_result_json: { error: String((e as Error)?.message ?? e) },
        model_version: MODEL,
      });
      continue;
    }

    const ctx = {
      block: {
        kind: block.kind,
        durationMinutes: Number(block.durationMinutes ?? 0),
        targetId: block.targetId ?? null,
        targetType: block.targetType ?? null,
        targetLabel: block.targetLabel ?? null,
        fromLabel: block.fromLabel ?? null,
        toLabel: block.toLabel ?? null,
      },
      hasHomePrivateConflict:
        /home|private|hem/i.test(`${block.title ?? ""} ${block.subtitle ?? ""}`),
      hasDirectAssignment: Boolean(block.targetId),
      hasStrongTransportEvidence:
        Boolean(block.fromLabel && block.toLabel && block.fromLabel !== block.toLabel),
    };
    const flags = evaluateSafetyFlags(suggestion, ctx);
    const apply = shouldAutoApply(suggestion, flags);

    const reviewMeta: AiReviewMeta = {
      reviewed: true,
      status: apply ? "auto_applied" : "uncertain",
      confidenceScore: suggestion.confidenceScore,
      confidenceLabel: confidenceLabel(suggestion.confidenceScore),
      originalKind: original.kind,
      originalReviewState: original.reviewState,
      originalLabel: String(original.title ?? ""),
      aiKind: suggestion.suggestedKind,
      aiLabel: suggestion.suggestedLabel,
      aiClassification: suggestion.suggestedKind,
      reasoningSummary: suggestion.reasoningSummary,
      evidenceUsed: suggestion.evidenceUsed,
      concerns: suggestion.concerns,
      reviewedAt: new Date().toISOString(),
      modelVersion: MODEL,
    };

    if (apply && ALLOWED_AI_KINDS.has(suggestion.suggestedKind as never)) {
      block.kind = suggestion.suggestedKind;
      block.reviewState = "ok";
      block.title = suggestion.suggestedLabel || block.title;
      auditStatus = "auto_applied";
      appliedKind = block.kind;
    } else {
      auditStatus = "uncertain";
      appliedKind = block.kind; // oförändrat
    }
    block.aiReview = reviewMeta;

    auditRows.push({
      organization_id: cache.organization_id,
      staff_id: cache.staff_id,
      date: cache.date,
      engine_version: cache.engine_version,
      cache_id: cache.id,
      block_id: block.id,
      status: auditStatus,
      original_block_json: original,
      ai_result_json: suggestion,
      updated_block_json: block,
      confidence_score: suggestion.confidenceScore,
      suggested_kind: suggestion.suggestedKind,
      applied_kind: appliedKind,
      reasoning_summary: suggestion.reasoningSummary,
      evidence_used_json: suggestion.evidenceUsed,
      safety_flags_json: flags,
      model_version: MODEL,
    });
  }

  // Markera tidigare audit-rader som inte längre current
  await admin
    .from("time_report_ai_block_audit")
    .update({ is_current: false })
    .eq("cache_id", cache.id)
    .eq("is_current", true);

  if (auditRows.length > 0) {
    await admin.from("time_report_ai_block_audit").insert(auditRows);
  }

  // Recalc summary + skriv tillbaka
  const totals = recalculateSummaryFromReportBlocks(updatedBlocks);
  const newSummary = { ...(cache.summary_json as Record<string, unknown> ?? {}), ...totals };
  const newSignature = await sha256(JSON.stringify(updatedBlocks) + "|" + cache.engine_version);

  await admin
    .from("staff_day_report_cache")
    .update({
      // Time Legacy Purge 2: AI får ENDAST uppdatera legacy-fält
      // (report_candidate_blocks_json + summary_json). display_blocks_json
      // ägs uteslutande av DisplayTimelineV2-pipelinen och får aldrig skrivas
      // härifrån — annars läcker AI-tolkade legacy-block in som canonical
      // UI-sanning i admin/mobil.
      report_candidate_blocks_json: updatedBlocks,
      summary_json: newSummary,
      ai_review_signature: newSignature,
      ai_review_pending: false,
      ai_review_at: new Date().toISOString(),
    })
    .eq("id", cache.id);

  return json(200, {
    ok: true,
    source: "legacy_report_candidate_ai_review",
    canonicalDisplaySource: "display_timeline_v2",
    displayBlocksWritten: false,
    candidatesProcessed: candidates.length,
    autoApplied: auditRows.filter((r) => r.status === "auto_applied").length,
    uncertain: auditRows.filter((r) => r.status === "uncertain").length,
    failed: auditRows.filter((r) => r.status === "failed").length,
  });
});

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callAi(block: Block): Promise<AiSuggestion> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const system = [
    "Du klassar ETT oklart tidrapportblock från en regelmotor.",
    "Tillåtna klasser: transport, work, exclude_from_report, unknown, break, private, needs_review.",
    "FÖRBJUDET: hitta på nya klasser, dra av tid, ändra approved/locked dagar, motsäga assigned target.",
    "Sätt shouldAutoApply=true ENDAST om du är säker (>=0.75) och safetyFlags är tom.",
    "För 'work' utan känd target krävs minst 0.85.",
    "Returnera ALLTID via verktyget classify_block.",
  ].join("\n");

  const user = {
    block_kind: block.kind,
    review_state: block.reviewState,
    duration_minutes: block.durationMinutes,
    title: block.title,
    subtitle: block.subtitle,
    target: { id: block.targetId, type: block.targetType, label: block.targetLabel },
    from_label: block.fromLabel,
    to_label: block.toLabel,
    reasons: block.reviewReasons ?? [],
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "classify_block",
          parameters: {
            type: "object",
            properties: {
              suggestedKind: { type: "string", enum: ["transport","work","exclude_from_report","unknown","break","private","needs_review"] },
              suggestedLabel: { type: "string" },
              confidenceScore: { type: "number", minimum: 0, maximum: 1 },
              confidenceLabel: { type: "string", enum: ["very_high","high","medium","low"] },
              reasoningSummary: { type: "string" },
              evidenceUsed: { type: "array", items: { type: "string" } },
              concerns: { type: "array", items: { type: "string" } },
              safetyFlags: { type: "array", items: { type: "string" } },
              shouldAutoApply: { type: "boolean" },
            },
            required: ["suggestedKind","suggestedLabel","confidenceScore","confidenceLabel","reasoningSummary","evidenceUsed","concerns","safetyFlags","shouldAutoApply"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify_block" } },
    }),
  });

  if (resp.status === 429) throw new Error("ai_rate_limited");
  if (resp.status === 402) throw new Error("ai_payment_required");
  if (!resp.ok) throw new Error(`ai_gateway_${resp.status}`);
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("ai_no_tool_call");
  return JSON.parse(args) as AiSuggestion;
}
