// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// workday-ai-auto-stop
//
// Runs every 15 minutes. Finds workdays that:
//   • are still open (ended_at IS NULL),
//   • have NO running activity timer right now (no open location_time_entries
//     and no time_reports without end_time for today), AND
//   • the latest finished activity ended ≥ STALE_AFTER_MINUTES (60) ago.
//
// For each candidate, gathers a compact context (last activity, last GPS pings,
// inferred home, planned end-of-day, fixed locations including warehouse) and
// asks Lovable AI (google/gemini-3-flash-preview) via tool-calling to classify:
//   verdict  ∈ went_home | other_job | warehouse | still_working | unclear
//   confidence 0..1
//   reasoning short Swedish explanation
//   suggested_end_iso (best guess of when the day ended)
//
// If verdict ∈ {went_home, other_job, warehouse} AND confidence ≥ 0.85,
// we close the workday at suggested_end_iso (clamped to last_activity_end…now)
// and write a workday_flag of type `auto_ended_by_ai` so the user can review
// and the mobile day-clock can clear itself. Otherwise we just log a flag of
// type `unclear_day_end` (low-noise, severity=info) so we don't silently
// mutate reported time.
//
// Auth: requires `x-cron-secret` header. Multi-tenant: per-org loop.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const STALE_AFTER_MINUTES = 60; // user requirement: trigger after 1h
const CONFIDENCE_THRESHOLD = 0.85;
const MAX_CANDIDATES_PER_ORG = 25;

// ── helpers ────────────────────────────────────────────────────────────────

function distMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function findLastActivityEnd(
  supabase: any,
  organizationId: string,
  staffId: string,
  dateStr: string,
): Promise<string | null> {
  const candidates: string[] = [];

  const { data: lte } = await supabase
    .from("location_time_entries")
    .select("exited_at")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("entry_date", dateStr)
    .not("exited_at", "is", null)
    .order("exited_at", { ascending: false })
    .limit(1);
  if (lte?.[0]?.exited_at) candidates.push(lte[0].exited_at);

  const { data: tr } = await supabase
    .from("time_reports")
    .select("report_date, end_time")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("report_date", dateStr)
    .not("end_time", "is", null)
    .order("end_time", { ascending: false })
    .limit(1);
  if (tr?.[0]?.end_time) {
    candidates.push(new Date(`${tr[0].report_date}T${tr[0].end_time}Z`).toISOString());
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

async function hasOpenActivity(
  supabase: any,
  organizationId: string,
  staffId: string,
  dateStr: string,
): Promise<boolean> {
  const [{ data: lte }, { data: tr }] = await Promise.all([
    supabase
      .from("location_time_entries")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("entry_date", dateStr)
      .is("exited_at", null)
      .limit(1),
    supabase
      .from("time_reports")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("report_date", dateStr)
      .is("end_time", null)
      .limit(1),
  ]);
  return (lte?.length || 0) > 0 || (tr?.length || 0) > 0;
}

async function collectContext(
  supabase: any,
  organizationId: string,
  staffId: string,
  dateStr: string,
  lastActivityEndIso: string,
) {
  const dayStartIso = new Date(`${dateStr}T00:00:00Z`).toISOString();
  const nowIso = new Date().toISOString();

  // GPS pings AFTER last activity ended (most informative window)
  const { data: pings } = await supabase
    .from("staff_location_history")
    .select("lat, lng, recorded_at")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .gte("recorded_at", lastActivityEndIso)
    .lte("recorded_at", nowIso)
    .order("recorded_at", { ascending: true })
    .limit(200);

  // Last activity context (where did they leave from?)
  const { data: lastLte } = await supabase
    .from("location_time_entries")
    .select(
      "exited_at, location_id, organization_locations(name, latitude, longitude)",
    )
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("entry_date", dateStr)
    .not("exited_at", "is", null)
    .order("exited_at", { ascending: false })
    .limit(1);

  // Inferred home
  const { data: homes } = await supabase
    .from("staff_inferred_home_locations")
    .select("lat, lng, confidence")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("valid_until", null)
    .order("confidence", { ascending: false })
    .limit(1);

  // Org-known fixed locations (warehouse etc.)
  const { data: locs } = await supabase
    .from("organization_locations")
    .select("name, latitude, longitude, kind")
    .eq("organization_id", organizationId)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(50);

  // Planned end of day (best-effort)
  const { data: assignments } = await supabase
    .from("booking_staff_assignments")
    .select("booking_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("assignment_date", dateStr);

  const home = homes?.[0]
    ? { lat: Number(homes[0].lat), lng: Number(homes[0].lng) }
    : null;

  // Distance summary to known anchors for the LAST ping
  const lastPing = pings && pings.length > 0 ? pings[pings.length - 1] : null;
  const anchors: Array<{ name: string; kind: string; meters: number }> = [];
  if (lastPing) {
    const lp = { lat: Number(lastPing.lat), lng: Number(lastPing.lng) };
    if (home) {
      anchors.push({ name: "Hem (gissad)", kind: "home", meters: Math.round(distMeters(lp, home)) });
    }
    for (const l of locs || []) {
      anchors.push({
        name: l.name,
        kind: l.kind || "site",
        meters: Math.round(
          distMeters(lp, { lat: Number(l.latitude), lng: Number(l.longitude) }),
        ),
      });
    }
    anchors.sort((a, b) => a.meters - b.meters);
  }

  // Compact ping summary (downsample to ~12 points)
  const downsampled =
    pings && pings.length > 0
      ? pings.filter((_: any, i: number) => i % Math.max(1, Math.ceil(pings.length / 12)) === 0)
      : [];

  return {
    last_activity_end_iso: lastActivityEndIso,
    last_activity_location:
      lastLte?.[0]
        ? {
            name: (lastLte[0] as any).organization_locations?.name || null,
            id: lastLte[0].location_id,
          }
        : null,
    has_planned_work_today: (assignments?.length || 0) > 0,
    inferred_home: home,
    anchors_nearest_to_last_ping: anchors.slice(0, 5),
    last_ping: lastPing
      ? { lat: Number(lastPing.lat), lng: Number(lastPing.lng), recorded_at: lastPing.recorded_at }
      : null,
    pings_count: pings?.length || 0,
    pings_sample: downsampled.map((p: any) => ({
      t: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
    })),
    minutes_since_last_activity: Math.round(
      (Date.now() - new Date(lastActivityEndIso).getTime()) / 60000,
    ),
  };
}

async function classifyWithAI(context: any): Promise<{
  verdict: "went_home" | "other_job" | "warehouse" | "still_working" | "unclear";
  confidence: number;
  reasoning: string;
  suggested_end_iso: string | null;
} | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("[ai-auto-stop] LOVABLE_API_KEY missing");
    return null;
  }

  const systemPrompt =
    "Du analyserar om en fältarbetare slutat för dagen baserat på GPS-data och planering. " +
    "Var konservativ: kräv tydliga signaler för hög konfidens. " +
    "Hög konfidens (≥0.85) endast när: (a) sista pingen är mycket nära hem (<150m) i flera pings, " +
    "(b) sista pingen är vid lager/warehouse-anchor (<150m) under stillastående tid utan att timer startats där, " +
    "eller (c) personalen är på annan känd plats där annan timer rullar. " +
    "Om GPS saknas eller är otydlig → unclear med låg konfidens. Returnera ALLTID via tool call.";

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Analysera följande situation och bedöm om arbetsdagen är slut:\n\n" +
          JSON.stringify(context, null, 2),
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "classify_workday_status",
          description: "Klassificera om arbetsdagen ska auto-stoppas",
          parameters: {
            type: "object",
            properties: {
              verdict: {
                type: "string",
                enum: ["went_home", "other_job", "warehouse", "still_working", "unclear"],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reasoning: { type: "string", description: "Kort förklaring på svenska, max 2 meningar" },
              suggested_end_iso: {
                type: ["string", "null"],
                description: "ISO-timestamp för bästa gissning av sluttid, eller null",
              },
            },
            required: ["verdict", "confidence", "reasoning", "suggested_end_iso"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "classify_workday_status" } },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("[ai-auto-stop] AI gateway error", resp.status, t.slice(0, 300));
    return null;
  }

  const data = await resp.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("[ai-auto-stop] no tool_call returned");
    return null;
  }
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.error("[ai-auto-stop] could not parse tool args", e);
    return null;
  }
}

async function processOrganization(supabase: any, organizationId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() - STALE_AFTER_MINUTES * 60 * 1000).toISOString();

  // Open workdays that are at least STALE_AFTER_MINUTES old.
  const { data: openWorkdays } = await supabase
    .from("workdays")
    .select("id, staff_id, started_at, notes, review_status")
    .eq("organization_id", organizationId)
    .is("ended_at", null)
    .lt("started_at", horizon)
    .order("started_at", { ascending: true })
    .limit(MAX_CANDIDATES_PER_ORG);

  const summary = {
    candidates: openWorkdays?.length || 0,
    ai_calls: 0,
    auto_closed: 0,
    flagged_unclear: 0,
    skipped_running: 0,
    skipped_recent_activity: 0,
    errors: 0,
  };

  for (const wd of openWorkdays || []) {
    const dateStr = wd.started_at.slice(0, 10);

    // Skip if any activity timer still running
    if (await hasOpenActivity(supabase, organizationId, wd.staff_id, dateStr)) {
      summary.skipped_running++;
      continue;
    }

    const lastEnd = await findLastActivityEnd(
      supabase,
      organizationId,
      wd.staff_id,
      dateStr,
    );
    if (!lastEnd) {
      // No activity today at all — nothing to base AI on, leave to nightly watchdog.
      continue;
    }
    const minutesSince = (Date.now() - new Date(lastEnd).getTime()) / 60000;
    if (minutesSince < STALE_AFTER_MINUTES) {
      summary.skipped_recent_activity++;
      continue;
    }

    // Idempotency: skip if we already wrote an auto_ended_by_ai flag for this workday.
    const { data: existingFlag } = await supabase
      .from("workday_flags")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("staff_id", wd.staff_id)
      .eq("flag_date", dateStr)
      .in("flag_type", ["auto_ended_by_ai", "ai_unclear_day_end"])
      .limit(1);
    if (existingFlag && existingFlag.length > 0) continue;

    let context;
    try {
      context = await collectContext(
        supabase,
        organizationId,
        wd.staff_id,
        dateStr,
        lastEnd,
      );
    } catch (e) {
      summary.errors++;
      console.error("[ai-auto-stop] context error", (e as Error).message);
      continue;
    }

    const ai = await classifyWithAI(context);
    summary.ai_calls++;
    if (!ai) {
      summary.errors++;
      continue;
    }

    const isFinishedVerdict =
      ai.verdict === "went_home" ||
      ai.verdict === "other_job" ||
      ai.verdict === "warehouse";

    if (isFinishedVerdict && ai.confidence >= CONFIDENCE_THRESHOLD) {
      // Pick suggested end, clamp to [lastEnd … now]
      const lastEndMs = new Date(lastEnd).getTime();
      const nowMs = Date.now();
      let endMs = ai.suggested_end_iso ? new Date(ai.suggested_end_iso).getTime() : lastEndMs;
      if (!Number.isFinite(endMs)) endMs = lastEndMs;
      if (endMs < lastEndMs) endMs = lastEndMs;
      if (endMs > nowMs) endMs = nowMs;
      const endedAtIso = new Date(endMs).toISOString();

      const noteMark = `[ai-auto-stopped: ${ai.verdict} ${Math.round(ai.confidence * 100)}%]`;
      const newNotes = wd.notes && wd.notes.includes(noteMark)
        ? wd.notes
        : [wd.notes, noteMark].filter(Boolean).join(" ");

      const { error } = await supabase
        .from("workdays")
        .update({
          ended_at: endedAtIso,
          ended_by: "system_ai_auto_stop",
          review_status:
            wd.review_status === "approved" ? wd.review_status : "needs_review",
          notes: newNotes,
        })
        .eq("id", wd.id)
        .is("ended_at", null);

      if (error) {
        summary.errors++;
        console.error("[ai-auto-stop] workday close failed", error.message);
        continue;
      }

      await supabase.from("workday_flags").insert({
        organization_id: organizationId,
        staff_id: wd.staff_id,
        flag_type: "auto_ended_by_ai",
        severity: "info",
        flag_date: dateStr,
        title: "Din arbetsdag stoppades automatiskt",
        description:
          `AI bedömde att du slutat (${ai.verdict}, ${Math.round(ai.confidence * 100)}%): ${ai.reasoning}`,
        needs_user_input: true,
        context: {
          verdict: ai.verdict,
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          suggested_end_iso: endedAtIso,
          last_activity_end_iso: lastEnd,
          ai_input: context,
          affected_entries: [{ table: "workdays", id: wd.id }],
        },
      });
      summary.auto_closed++;
    } else {
      // Low-confidence / unclear → just flag, do NOT mutate time.
      await supabase.from("workday_flags").insert({
        organization_id: organizationId,
        staff_id: wd.staff_id,
        flag_type: "ai_unclear_day_end",
        severity: "info",
        flag_date: dateStr,
        title: "Glömt avsluta arbetsdagen?",
        description:
          `Ingen aktivitet sedan ${new Date(lastEnd).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}. ${ai.reasoning}`,
        needs_user_input: true,
        context: {
          verdict: ai.verdict,
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          last_activity_end_iso: lastEnd,
          ai_input: context,
        },
      });
      summary.flagged_unclear++;
    }
  }

  return summary;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const provided = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id");
    if (orgErr) throw orgErr;

    const totals = {
      orgs_processed: 0,
      candidates: 0,
      ai_calls: 0,
      auto_closed: 0,
      flagged_unclear: 0,
      skipped_running: 0,
      skipped_recent_activity: 0,
      errors: 0,
    };

    for (const org of orgs || []) {
      const r = await processOrganization(supabase, org.id);
      totals.orgs_processed++;
      totals.candidates += r.candidates;
      totals.ai_calls += r.ai_calls;
      totals.auto_closed += r.auto_closed;
      totals.flagged_unclear += r.flagged_unclear;
      totals.skipped_running += r.skipped_running;
      totals.skipped_recent_activity += r.skipped_recent_activity;
      totals.errors += r.errors;
    }

    console.log("[ai-auto-stop] done", totals);
    return new Response(JSON.stringify({ success: true, ...totals }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-auto-stop] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
