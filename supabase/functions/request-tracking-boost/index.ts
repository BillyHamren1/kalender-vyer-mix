/**
 * request-tracking-boost
 * ────────────────────────────────────────────────────────────────────────────
 * Rule engine / AI / admin requests a short tracking boost for a staff member.
 *
 * Body:
 *   { staffId, mode, reason, targetId?, targetType?, requestedBy, durationSeconds? }
 *
 * Rules:
 *   - durationSeconds is clamped to [60, 300] (1–5 min). DB trigger also caps.
 *   - mode must be one of: clarification_boost | near_target | approaching_target
 *   - requestedBy ∈ rule_engine | ai | admin | system
 *   - Locked days (day_attestations) accept the boost — boost only changes
 *     adaptive GPS, never time data.
 *
 * Audit: writes one staff_day_decision_log row (actor=rule_engine/ai/admin).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logDayDecision, type DecisionActor } from "../_shared/day-decision-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_MODES = new Set(["clarification_boost", "near_target", "approaching_target"]);
const ALLOWED_REQUESTORS = new Set<DecisionActor>(["rule_engine", "ai", "admin", "system"]);

function bad(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
    return bad(401, "missing_auth");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const staffId = String(body?.staffId ?? "");
  const mode = String(body?.mode ?? "");
  const reason = String(body?.reason ?? "");
  const requestedBy = String(body?.requestedBy ?? "");
  const targetId = body?.targetId ? String(body.targetId) : null;
  const targetType = body?.targetType ? String(body.targetType) : null;
  const durationSeconds = Math.max(
    60,
    Math.min(300, Number(body?.durationSeconds ?? 180) || 180),
  );

  if (!staffId) return bad(400, "staffId_required");
  if (!ALLOWED_MODES.has(mode)) return bad(400, "mode_invalid");
  if (!reason || reason.length < 3) return bad(400, "reason_required");
  if (!ALLOWED_REQUESTORS.has(requestedBy as DecisionActor)) return bad(400, "requestedBy_invalid");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: staff, error: staffErr } = await admin
    .from("staff_members")
    .select("id, organization_id")
    .eq("id", staffId)
    .maybeSingle();
  if (staffErr || !staff) return bad(404, "staff_not_found");

  // ── Rate limit: max 5 boosts per staff per rolling hour ────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recentCount } = await admin
    .from("tracking_policy_boosts")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .gte("created_at", oneHourAgo);
  if ((recentCount ?? 0) >= 5) {
    return bad(429, "rate_limited_max_5_per_hour");
  }

  // ── Per-target cooldown: refuse if user dismissed this target ──────
  if (targetType && targetId) {
    const targetKey = `${targetType}:${targetId}`;
    const { data: dismiss } = await admin
      .from("tracking_boost_dismissals")
      .select("id, expires_at")
      .eq("staff_id", staffId)
      .eq("target_key", targetKey)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (dismiss) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: "dismissed_cooldown_active",
          targetKey,
          cooldownUntil: dismiss.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── Per-target boost cooldown: don't stack on top of a still-active boost ──
  if (targetType && targetId) {
    const { data: existing } = await admin
      .from("tracking_policy_boosts")
      .select("id, expires_at")
      .eq("staff_id", staffId)
      .eq("target_id", targetId)
      .eq("target_type", targetType)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ ok: true, boost: existing, deduped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // expiresAt is also clamped server-side by clamp_tracking_boost_expiry trigger (max 5 min).
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  const { data: ins, error: insErr } = await admin
    .from("tracking_policy_boosts")
    .insert({
      organization_id: staff.organization_id,
      staff_id: staffId,
      mode,
      reason,
      target_id: targetId,
      target_type: targetType,
      requested_by: requestedBy,
      expires_at: expiresAt,
    })
    .select("id, expires_at, mode, reason, target_id, target_type")
    .single();

  if (insErr) {
    return bad(500, `insert_failed: ${insErr.message}`);
  }

  await logDayDecision(admin, {
    organizationId: staff.organization_id as string,
    staffId,
    dayDate: new Date().toISOString().slice(0, 10),
    actor: requestedBy as DecisionActor,
    action: "tracking_policy_boost",
    before: null,
    after: ins,
    reason,
    confidence: null,
    sourceFunction: "request-tracking-boost",
  });

  return new Response(JSON.stringify({ ok: true, boost: ins }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
