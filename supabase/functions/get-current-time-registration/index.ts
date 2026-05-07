// get-current-time-registration
// ─────────────────────────────────────────────────────────────────────────────
// Backend single source of truth for "what is registering my time right now?"
//
// Reads ONLY from `active_time_registrations` (status='active'). Optionally
// runs the new Time Engine GPS classifier on the latest 20 minutes of pings
// to refresh current_kind/current_label/confidence on the active row.
//
// MUST NOT read from:
//   - location_time_entries
//   - current_time_registration  (legacy mirror)
//   - time_reports / workdays / travel_time_logs
//   - gamla snapshots / buildGpsDayTimelineOnly
//
// Output (new model):
//   inactive: { active: false, label: "Tid registreras inte", elapsedSeconds: 0 }
//   active:   { active: true, registrationId, startedAt, elapsedSeconds,
//               currentKind, currentLabel, currentTargetType, currentTargetId,
//               confidence, needsUserChoice, startSource, autoStarted }
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import {
  buildGpsDayTimeline,
  type GpsPing,
} from "../_shared/time-engine/buildGpsDayTimeline.ts";
import {
  resolveWorkTargets,
  toWorkTarget,
} from "../_shared/time-engine/resolveWorkTargets.ts";
import { classifyActiveSegment } from "../_shared/time-engine/timePolicy.ts";
import type { TargetMatch, WorkTarget } from "../_shared/time-engine/contracts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const todayLocalIsoDate = (d = new Date()) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authRes = await authenticateStaffRequest(req);
  if (!authRes.ok) return json(authRes.err.status, { error: authRes.err.error });
  const { auth } = authRes;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let staffId: string;
  let organizationId: string;
  if (auth.mode === "mobile") {
    staffId = auth.staffId;
    organizationId = auth.organizationId;
  } else {
    const { data: prof } = await admin.from("profiles")
      .select("staff_id, organization_id")
      .eq("user_id", auth.userId).maybeSingle();
    if (!prof?.staff_id) return json(404, { error: "no staff link" });
    staffId = prof.staff_id;
    organizationId = prof.organization_id;
  }

  // Single source of truth: active_time_registrations.
  const { data: active } = await admin
    .from("active_time_registrations")
    .select(
      "id, started_at, start_source, auto_started, current_kind, current_label, current_target_type, current_target_id, current_confidence, needs_user_choice, manual_override_kind, manual_override_label, manual_override_target_type, manual_override_target_id",
    )
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) {
    return json(200, {
      active: false,
      label: "Tid registreras inte",
      elapsedSeconds: 0,
    });
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(active.started_at)) / 1000),
  );

  // Manual override wins.
  if (active.manual_override_kind) {
    return json(200, {
      active: true,
      registrationId: active.id,
      startedAt: active.started_at,
      elapsedSeconds,
      currentKind: active.manual_override_kind,
      currentLabel: active.manual_override_label ?? active.manual_override_kind,
      currentTargetType: active.manual_override_target_type,
      currentTargetId: active.manual_override_target_id,
      confidence: 1,
      needsUserChoice: false,
      startSource: active.start_source,
      autoStarted: active.auto_started,
    });
  }

  // GPS reclassification of "now" — last ~20 minutes of pings.
  let currentKind = active.current_kind;
  let currentLabel = active.current_label;
  let currentTargetType = active.current_target_type;
  let currentTargetId = active.current_target_id;
  let confidence = Number(active.current_confidence ?? 0);
  let needsUserChoice = !!active.needs_user_choice;

  try {
    const sinceIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: pingsData } = await admin
      .from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy, speed")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .limit(200);

    const pings: GpsPing[] = (pingsData ?? []).map((p: any) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
      speedMps: p.speed != null ? Number(p.speed) : null,
    }));

    if (pings.length >= 2) {
      const { targets: resolved } = await resolveWorkTargets({
        organizationId,
        staffId,
        date: todayLocalIsoDate(),
        supabaseAdmin: admin,
      });
      const workTargets: WorkTarget[] = resolved
        .map(toWorkTarget)
        .filter((t): t is WorkTarget => !!t);

      const timeline = buildGpsDayTimeline({
        staffId,
        organizationId,
        date: todayLocalIsoDate(),
        pings,
        targets: workTargets,
      });

      const last = timeline.segments[timeline.segments.length - 1];
      if (last) {
        const matchedTarget = workTargets.find((t) => t.refId === last.matchedTargetId);
        const fakeMatch: TargetMatch = {
          segmentId: last.id,
          outcome:
            last.kind === "travel" || last.type === "transport" ? "transport"
            : last.kind === "gps_gap" || last.type === "gps_gap" ? "gps_uncertain"
            : last.type === "known_site" && matchedTarget ? "inside_known_target"
            : "unknown_place",
          target: matchedTarget,
          confidence: last.confidence,
        };
        const seg = classifyActiveSegment(
          {
            id: last.id,
            startedAt: last.startTs,
            endedAt: last.endTs,
            kind:
              last.kind === "stay" ? "stationary"
              : last.kind === "travel" ? "movement"
              : "gps_gap",
            confidence: last.confidence,
            pingCount: last.pingCount,
          },
          fakeMatch,
        );

        const decisive =
          seg.kind === "transport" ||
          seg.kind === "unknown_place" ||
          seg.kind === "gps_uncertain" ||
          ((seg.kind === "project" || seg.kind === "booking" || seg.kind === "warehouse") &&
            !!matchedTarget);

        if (decisive) {
          currentKind = seg.kind;
          currentLabel = seg.label;
          confidence = last.confidence;
          if (matchedTarget && (seg.kind === "project" || seg.kind === "booking" || seg.kind === "warehouse")) {
            currentTargetType = matchedTarget.kind;
            currentTargetId = matchedTarget.refId;
            needsUserChoice = false;
          } else if (seg.kind === "unknown_place" || seg.kind === "gps_uncertain") {
            currentTargetType = null;
            currentTargetId = null;
            needsUserChoice = true;
          } else if (seg.kind === "transport") {
            currentTargetType = null;
            currentTargetId = null;
            needsUserChoice = false;
          }

          // Persist (best-effort)
          await admin
            .from("active_time_registrations")
            .update({
              current_kind: currentKind,
              current_label: currentLabel,
              current_target_type: currentTargetType,
              current_target_id: currentTargetId,
              current_confidence: confidence,
              needs_user_choice: needsUserChoice,
            })
            .eq("id", active.id);
        }
      }
    }
  } catch (_e) {
    // non-fatal — fall back to stored classification
  }

  return json(200, {
    active: true,
    registrationId: active.id,
    startedAt: active.started_at,
    elapsedSeconds,
    currentKind,
    currentLabel,
    currentTargetType,
    currentTargetId,
    confidence,
    needsUserChoice,
    startSource: active.start_source,
    autoStarted: active.auto_started,
  });
});
