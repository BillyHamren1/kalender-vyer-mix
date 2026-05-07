// get-current-time-registration  (LEGACY THIN WRAPPER)
// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — kept for backwards compatibility with older mobile clients
// (useCurrentTimeRegistration). The single source of truth for active timer
// state in the new Time Engine is the table `active_time_registrations` and
// the canonical endpoint is `get-active-time-registration-status`.
//
// This wrapper:
//   * Reads ONLY from `active_time_registrations` (status='active').
//   * NEVER reads from `current_time_registration` or `location_time_entries`.
//   * Does NOT run the GPS classifier — call `get-active-time-registration-status`
//     for live GPS-driven kind/label updates.
//
// Output shape preserved for `useCurrentTimeRegistration`.
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";

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
      "id, started_at, current_kind, current_label, current_confidence, needs_user_choice, manual_override_kind, manual_override_label",
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
      label: "Tid registreras inte",
      kind: "none",
      canGpsCreateTime: false,
    });
  }

  const overrideKind = active.manual_override_kind as RegistrationKind | null;
  const kind = (overrideKind ?? (active.current_kind as RegistrationKind | null) ?? "unknown_place") as RegistrationKind;
  const label = active.manual_override_label
    ?? active.current_label
    ?? "Okänd plats";

  return json(200, {
    _deprecated: "use get-active-time-registration-status",
    timerActive: true,
    timerId: String(active.id),
    timerStartedAt: active.started_at,
    label,
    kind,
    confidence: overrideKind ? 1 : Number(active.current_confidence ?? 0),
    needsUserChoice: overrideKind ? false : !!active.needs_user_choice,
  });
});
