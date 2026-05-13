// get-active-timer-status  (LEGACY THIN WRAPPER)
// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — kept for backwards compatibility with older mobile clients
// (useActiveTimerStatus). The single source of truth for active timer state
// in the new Time Engine is the table `active_time_registrations` and the
// canonical endpoint is `get-active-time-registration-status`.
//
// This wrapper:
//   * Reads ONLY from `active_time_registrations` (status='active').
//   * NEVER reads from `current_time_registration` or `location_time_entries`.
//   * Does NOT run the GPS classifier — call `get-active-time-registration-status`
//     for live GPS-driven kind/label updates.
//
// Output shape preserved for `useActiveTimerStatus`.
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import { buildTimerOwnershipDiagnostics } from "../_shared/diagnostics/buildTimerOwnershipDiagnostics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RegistrationKind =
  | "none"
  | "known_site"
  | "project"
  | "booking"
  | "warehouse"
  | "transport"
  | "unknown_place"
  | "gps_uncertain";

type RegistrationSource = "user_started" | "gps_classifier" | "none";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      _deprecated: "use get-active-time-registration-status",
      timerActive: false,
      timeRegistrationActive: false,
      currentRegistration: null,
      gpsOnly: true,
      message: "Ingen tid registreras. Starta timern för att börja registrera tid.",
      timerId: null,
      startedAt: null,
      elapsedSeconds: 0,
      registrationKind: "none",
      registrationLabel: "Tid registreras inte",
      registrationSource: "none",
      confidence: 0,
      needsUserChoice: false,
      canGpsStartTimer: false,
    });
  }

  const startedAt = active.started_at as string;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );

  const overrideKind = active.manual_override_kind as RegistrationKind | null;
  const registrationKind = (overrideKind
    ?? (active.current_kind as RegistrationKind | null)
    ?? "unknown_place") as RegistrationKind;
  const registrationLabel = active.manual_override_label
    ?? active.current_label
    ?? "Okänd plats";
  const confidence = overrideKind ? 1 : Number(active.current_confidence ?? 0);
  const needsUserChoice = overrideKind ? false : !!active.needs_user_choice;
  const registrationSource: RegistrationSource = active.auto_started
    ? "gps_classifier"
    : "user_started";

  return json(200, {
    _deprecated: "use get-active-time-registration-status",
    timerActive: true,
    timeRegistrationActive: true,
    currentRegistration: {
      id: String(active.id),
      staff_id: staffId,
      organization_id: organizationId,
      started_at: startedAt,
      started_by_user: !active.auto_started,
      status: "active",
      current_kind: registrationKind,
      current_label: registrationLabel,
      source: active.start_source,
      last_gps_classification_at: null,
    },
    gpsOnly: false,
    timerId: String(active.id),
    startedAt,
    elapsedSeconds,
    registrationKind,
    registrationLabel,
    registrationSource,
    confidence,
    needsUserChoice,
    canGpsStartTimer: false,
  });
});
