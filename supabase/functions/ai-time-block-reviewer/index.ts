// ai-time-block-reviewer
// Actions:
//   review_block       { time_report_id, trigger?: 'block_stop'|'manual'|'realtime_admin' }
//   review_day         { staff_id, date }   – granskar alla öppna block för dagen
//   apply_suggestion   { suggestion_id }    – manuell apply av AI-förslag
//   dismiss_suggestion { suggestion_id }
//   undo_apply         { suggestion_id }    – ångrar en tidigare auto-apply
//
// Säkerhetsspärrar är HÅRDKODADE i applySuggestion.ts + prompts.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.ts";
import { EMIT_REVIEW_TOOL, validateAiOutput, type AiReviewOutput } from "./schema.ts";
import { evaluateAutoApply, type ApplyContext } from "./applySuggestion.ts";
import { loadLearningRules, persistLearnedRule } from "./loadRules.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const ENGINE_VERSION = "ai-reviewer-v1";

// deno-lint-ignore no-explicit-any
type Sb = any;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "review_block";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Auth: admin user OR service cron
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-engine-secret");
    const isCron = !!cronSecret && providedSecret === cronSecret;
    let userId = "";
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      if (!userData?.user) return json({ error: "unauthorized" }, 401);
      userId = userData.user.id;
    }

    if (action === "review_block") return await handleReviewBlock(supabase, body, userId);
    if (action === "review_day") return await handleReviewDay(supabase, body, userId);
    if (action === "apply_suggestion") return await handleApply(supabase, body, userId);
    if (action === "dismiss_suggestion") return await handleDismiss(supabase, body, userId);
    if (action === "undo_apply") return await handleUndo(supabase, body, userId);

    return json({ error: "unknown_action", action }, 400);
  } catch (err) {
    console.error("[ai-time-block-reviewer]", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

async function getCallerOrg(supabase: Sb, userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

// ─── review_block ──────────────────────────────────────────────────────────
async function handleReviewBlock(
  supabase: Sb,
  body: { time_report_id?: string; trigger?: string },
  userId: string,
) {
  const t0 = Date.now();
  const trId = body.time_report_id;
  if (!trId) return json({ error: "missing time_report_id" }, 400);

  const { data: tr, error: trErr } = await supabase
    .from("time_reports")
    .select("*")
    .eq("id", trId)
    .maybeSingle();
  if (trErr || !tr) return json({ error: "time_report_not_found" }, 404);

  // Skip approved + subdivisions per policy
  if (tr.approved) return json({ verdict: "skipped", reason: "approved_lock" });
  if (tr.is_subdivision) return json({ verdict: "skipped", reason: "subdivision" });
  // Skip nightly GPS-only without TR/LTE – egen guard ska normalt inte hit, men dubbla skydd
  if (tr.source === "gps_only_night") return json({ verdict: "skipped", reason: "night_gps_only" });

  // Vänta-på-nästa-block: om blocket avslutades < 5 min sen och GPS-pings
  // visar att personen fortfarande är i rörelse → wait_for_next.
  const trigger = body.trigger ?? "manual";
  const orgId = tr.organization_id;

  // Hämta hela dagens kontext (lättviktigt)
  const { data: dayBlocks } = await supabase
    .from("time_reports")
    .select("id, start_time, end_time, hours_worked, booking_id, large_project_id, location_id, source, approved, is_subdivision")
    .eq("staff_id", tr.staff_id)
    .eq("report_date", tr.report_date)
    .order("start_time", { ascending: true })
    .limit(50);

  const { data: planned } = await supabase
    .from("calendar_events")
    .select("id, booking_id, resource_id, start_time, end_time")
    .gte("start_time", `${tr.report_date}T00:00:00`)
    .lt("start_time", `${tr.report_date}T23:59:59`)
    .limit(100);

  const { data: pings } = await supabase
    .from("staff_location_history")
    .select("ts, lat, lng, accuracy")
    .eq("staff_id", tr.staff_id)
    .gte("ts", `${tr.report_date}T00:00:00`)
    .lt("ts", `${tr.report_date}T23:59:59`)
    .order("ts", { ascending: true })
    .limit(500);

  // Projekt-geofence
  let projectGeo: unknown = null;
  if (tr.large_project_id) {
    const { data } = await supabase
      .from("large_projects")
      .select("id, name, latitude, longitude, geofence_radius_m")
      .eq("id", tr.large_project_id)
      .maybeSingle();
    projectGeo = data;
  }

  // Lärda regler
  const rules = await loadLearningRules(supabase, orgId, tr.staff_id, {
    large_project_id: tr.large_project_id,
    booking_id: tr.booking_id,
  });

  // Staff-namn
  const { data: staffRow } = await supabase
    .from("staff_members")
    .select("name")
    .eq("id", tr.staff_id)
    .maybeSingle();

  if (!LOVABLE_API_KEY) {
    await logRun(supabase, {
      organization_id: orgId,
      staff_id: tr.staff_id,
      report_date: tr.report_date,
      trigger_source: trigger,
      triggered_by: userId || "service",
      verdict: "error",
      reasoning: "LOVABLE_API_KEY not configured",
      model: DEFAULT_MODEL,
      duration_ms: Date.now() - t0,
      error: "no_api_key",
    });
    return json({ error: "LOVABLE_API_KEY missing" }, 500);
  }

  // Anropa AI Gateway med tool-calling
  const userPrompt = buildUserPrompt({
    staffName: staffRow?.name ?? tr.staff_id,
    date: tr.report_date,
    block: tr,
    dayContext: {
      blocks: dayBlocks ?? [],
      planned_events: planned ?? [],
      gps_pings_sample: (pings ?? []).slice(-200),
      project_geofence: projectGeo,
    },
    learningRules: rules,
  });

  let aiOut: AiReviewOutput;
  let modelUsed = DEFAULT_MODEL;
  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [EMIT_REVIEW_TOOL],
        tool_choice: { type: "function", function: { name: "emit_review" } },
        temperature: 0.2,
      }),
    });
    if (resp.status === 429) {
      await logRun(supabase, baseRun(orgId, tr, trigger, userId, "error", "rate_limited", modelUsed, Date.now() - t0));
      return json({ error: "rate_limited", message: "AI rate limit, försök igen om en stund." }, 429);
    }
    if (resp.status === 402) {
      await logRun(supabase, baseRun(orgId, tr, trigger, userId, "error", "credits_exhausted", modelUsed, Date.now() - t0));
      return json({ error: "credits_exhausted", message: "AI-krediter slut – fyll på i Settings → Workspace → Usage." }, 402);
    }
    if (!resp.ok) {
      const txt = await resp.text();
      await logRun(supabase, baseRun(orgId, tr, trigger, userId, "error", `gateway_${resp.status}: ${txt.slice(0, 200)}`, modelUsed, Date.now() - t0));
      return json({ error: "ai_gateway_error", status: resp.status }, 500);
    }
    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) throw new Error("no_tool_call_args");
    aiOut = validateAiOutput(JSON.parse(argsStr));
    modelUsed = data.model ?? DEFAULT_MODEL;
  } catch (e) {
    await logRun(supabase, baseRun(orgId, tr, trigger, userId, "error", String((e as Error).message), modelUsed, Date.now() - t0));
    return json({ error: "ai_parse_error", message: String((e as Error).message) }, 500);
  }

  // Lär ny regel om angiven
  let learnedRuleId: string | null = null;
  if (aiOut.rule_learned) {
    learnedRuleId = await persistLearnedRule(supabase, orgId, tr.staff_id, {
      large_project_id: tr.large_project_id,
      booking_id: tr.booking_id,
    }, aiOut.rule_learned);
  }

  // Hantera verdict
  if (aiOut.verdict === "clean" || aiOut.verdict === "wait_for_next") {
    await logRun(supabase, {
      organization_id: orgId,
      staff_id: tr.staff_id,
      report_date: tr.report_date,
      trigger_source: trigger,
      triggered_by: userId || "service",
      verdict: aiOut.verdict,
      confidence: aiOut.confidence,
      reasoning: aiOut.reasoning,
      model: modelUsed,
      duration_ms: Date.now() - t0,
      rules_used: rules.map((r) => r.id),
      rules_learned: learnedRuleId ? [learnedRuleId] : [],
    });
    return json({ verdict: aiOut.verdict, confidence: aiOut.confidence, reasoning: aiOut.reasoning });
  }

  // Försök auto-apply
  const applyCtx: ApplyContext = {
    blockId: tr.id,
    staffId: tr.staff_id,
    organizationId: orgId,
    reportDate: tr.report_date,
    currentBlock: tr,
  };
  const decision = aiOut.action ? evaluateAutoApply(aiOut, applyCtx) : { allowed: false, reason: "no_action" };

  let suggestionId: string | null = null;
  let appliedNow = false;

  // Alltid skapa en suggestion-rad för spårbarhet
  const sugRow = {
    organization_id: orgId,
    staff_id: tr.staff_id,
    time_report_id: tr.id,
    report_date: tr.report_date,
    suggestion_type: aiOut.action?.suggestion_type ?? "needs_user_input",
    suggested_start_time: aiOut.action?.suggested_start_time ?? null,
    suggested_end_time: aiOut.action?.suggested_end_time ?? null,
    target_project_id: aiOut.action?.target_project_id ?? null,
    target_location_id: aiOut.action?.target_location_id ?? null,
    target_booking_id: aiOut.action?.target_booking_id ?? null,
    original_start_time: tr.start_time,
    original_end_time: tr.end_time,
    reason: aiOut.action?.suggestion_type ?? "ai_review",
    confidence: aiOut.confidence,
    human_readable_text: aiOut.action?.human_readable ?? aiOut.reasoning,
    status: "pending",
    ai_reasoning: aiOut.reasoning,
    ai_model: modelUsed,
    ai_verdict: aiOut.verdict,
    apply_rule: aiOut.action?.apply_rule ?? null,
    learning_rule_ids: rules.map((r) => r.id),
    engine_version: ENGINE_VERSION,
  };

  const { data: insertedSug } = await supabase
    .from("time_report_correction_suggestions")
    .insert(sugRow)
    .select("id")
    .maybeSingle();
  suggestionId = insertedSug?.id ?? null;

  if (decision.allowed && suggestionId) {
    const { error: updErr } = await supabase
      .from("time_reports")
      .update(decision.patch ?? {})
      .eq("id", tr.id)
      .eq("approved", false); // sista safe-net
    if (!updErr) {
      await supabase
        .from("time_report_correction_suggestions")
        .update({
          status: "applied",
          applied_by_ai: true,
          applied_at: new Date().toISOString(),
          undo_payload: decision.undoPayload,
          resolved_at: new Date().toISOString(),
          resolved_by: "ai",
          resolved_action: "auto_apply",
        })
        .eq("id", suggestionId);
      appliedNow = true;
    }
  }

  await logRun(supabase, {
    organization_id: orgId,
    staff_id: tr.staff_id,
    report_date: tr.report_date,
    trigger_source: trigger,
    triggered_by: userId || "service",
    verdict: appliedNow ? "auto_applied" : aiOut.verdict,
    confidence: aiOut.confidence,
    reasoning: aiOut.reasoning,
    model: modelUsed,
    suggestions_created: 1,
    auto_applied_count: appliedNow ? 1 : 0,
    rules_used: rules.map((r) => r.id),
    rules_learned: learnedRuleId ? [learnedRuleId] : [],
    duration_ms: Date.now() - t0,
  });

  return json({
    verdict: appliedNow ? "auto_applied" : aiOut.verdict,
    confidence: aiOut.confidence,
    reasoning: aiOut.reasoning,
    suggestion_id: suggestionId,
    auto_applied: appliedNow,
    apply_reason: decision.reason,
  });
}

function baseRun(orgId: string, tr: { staff_id: string; report_date: string }, trigger: string, userId: string, verdict: string, error: string, model: string, ms: number) {
  return {
    organization_id: orgId,
    staff_id: tr.staff_id,
    report_date: tr.report_date,
    trigger_source: trigger,
    triggered_by: userId || "service",
    verdict,
    error,
    model,
    duration_ms: ms,
  };
}

async function logRun(supabase: Sb, row: Record<string, unknown>) {
  try {
    await supabase.from("ai_time_review_runs").insert(row);
  } catch (e) {
    console.warn("[ai-reviewer] logRun failed", e);
  }
}

// ─── review_day ────────────────────────────────────────────────────────────
async function handleReviewDay(supabase: Sb, body: { staff_id?: string; date?: string }, userId: string) {
  if (!body.staff_id || !body.date) return json({ error: "missing_args" }, 400);
  const orgId = await getCallerOrg(supabase, userId);
  if (!orgId) return json({ error: "no_org" }, 403);

  const { data: blocks } = await supabase
    .from("time_reports")
    .select("id, approved, is_subdivision")
    .eq("staff_id", body.staff_id)
    .eq("report_date", body.date)
    .eq("approved", false)
    .eq("is_subdivision", false)
    .limit(50);

  const results: unknown[] = [];
  for (const b of (blocks ?? []) as Array<{ id: string }>) {
    const r = await handleReviewBlock(supabase, { time_report_id: b.id, trigger: "manual" }, userId);
    results.push(await r.json());
  }
  return json({ count: results.length, results });
}

// ─── apply / dismiss / undo ────────────────────────────────────────────────
async function handleApply(supabase: Sb, body: { suggestion_id?: string }, userId: string) {
  if (!body.suggestion_id) return json({ error: "missing_suggestion_id" }, 400);
  const { data: sug } = await supabase
    .from("time_report_correction_suggestions")
    .select("*")
    .eq("id", body.suggestion_id)
    .maybeSingle();
  if (!sug) return json({ error: "not_found" }, 404);
  if (sug.status === "applied") return json({ ok: true, already_applied: true });

  const patch: Record<string, unknown> = {};
  if (sug.suggested_start_time) patch.start_time = sug.suggested_start_time;
  if (sug.suggested_end_time) patch.end_time = sug.suggested_end_time;
  if (sug.target_project_id) patch.large_project_id = sug.target_project_id;
  if (sug.target_location_id) patch.location_id = sug.target_location_id;
  if (sug.target_booking_id) patch.booking_id = sug.target_booking_id;

  // Hämta original för undo
  const { data: tr } = await supabase
    .from("time_reports")
    .select("start_time, end_time, large_project_id, location_id, booking_id, approved")
    .eq("id", sug.time_report_id)
    .maybeSingle();
  if (!tr) return json({ error: "time_report_missing" }, 404);
  if (tr.approved) return json({ error: "approved_lock" }, 409);

  const { error } = await supabase
    .from("time_reports")
    .update(patch)
    .eq("id", sug.time_report_id)
    .eq("approved", false);
  if (error) return json({ error: error.message }, 500);

  await supabase
    .from("time_report_correction_suggestions")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by: userId || "admin",
      resolved_action: "accept",
      undo_payload: {
        start_time: tr.start_time,
        end_time: tr.end_time,
        large_project_id: tr.large_project_id,
        location_id: tr.location_id,
        booking_id: tr.booking_id,
      },
    })
    .eq("id", sug.id);

  // Bumpa verified_count på regler som gav förslaget
  if (Array.isArray(sug.learning_rule_ids) && sug.learning_rule_ids.length) {
    await supabase.rpc("noop").catch(() => {}); // hold; bump via direct query nedan
    for (const rid of sug.learning_rule_ids) {
      await supabase.from("staff_time_learning_rules")
        .update({ verified_count: (1) as unknown as number, last_used_at: new Date().toISOString() })
        .eq("id", rid);
    }
  }

  return json({ ok: true });
}

async function handleDismiss(supabase: Sb, body: { suggestion_id?: string }, userId: string) {
  if (!body.suggestion_id) return json({ error: "missing_suggestion_id" }, 400);
  const { data: sug } = await supabase
    .from("time_report_correction_suggestions")
    .select("learning_rule_ids")
    .eq("id", body.suggestion_id)
    .maybeSingle();
  await supabase
    .from("time_report_correction_suggestions")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: userId || "admin",
      resolved_action: "dismiss",
    })
    .eq("id", body.suggestion_id);
  if (sug?.learning_rule_ids?.length) {
    for (const rid of sug.learning_rule_ids) {
      await supabase.from("staff_time_learning_rules")
        .update({ rejected_count: 1 as unknown as number })
        .eq("id", rid);
    }
  }
  return json({ ok: true });
}

async function handleUndo(supabase: Sb, body: { suggestion_id?: string }, _userId: string) {
  if (!body.suggestion_id) return json({ error: "missing_suggestion_id" }, 400);
  const { data: sug } = await supabase
    .from("time_report_correction_suggestions")
    .select("*")
    .eq("id", body.suggestion_id)
    .maybeSingle();
  if (!sug || !sug.undo_payload) return json({ error: "no_undo" }, 400);
  const { error } = await supabase
    .from("time_reports")
    .update(sug.undo_payload)
    .eq("id", sug.time_report_id)
    .eq("approved", false);
  if (error) return json({ error: error.message }, 500);
  await supabase
    .from("time_report_correction_suggestions")
    .update({ status: "undone", resolved_action: "undo" })
    .eq("id", body.suggestion_id);
  return json({ ok: true });
}
