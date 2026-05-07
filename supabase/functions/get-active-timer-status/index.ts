// get-active-timer-status
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for "what is the user's active timer + what is being
// registered right now?". The mobile app MUST consume this and not derive
// timer state locally from useWorkSession, location_time_entries, time_reports
// or workday tables.
//
// Rules:
//   1. timerActive=true ⇔ a user-started location_time_entries row exists
//      with exited_at IS NULL. GPS may NEVER create or start a row.
//   2. GPS engine is allowed to update registrationKind / registrationLabel /
//      confidence / needsUserChoice on the active timer.
//   3. canGpsStartTimer is always false.
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import { buildGpsDayTimelineOnly } from "../_shared/timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../_shared/timeline/types.ts";

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

interface InactiveResponse {
  timerActive: false;
  timeRegistrationActive: false;
  currentRegistration: null;
  gpsOnly: true;
  message: string;
  timerId: null;
  startedAt: null;
  elapsedSeconds: 0;
  registrationKind: "none";
  registrationLabel: "Tid registreras inte";
  registrationSource: "none";
  confidence: 0;
  needsUserChoice: false;
  canGpsStartTimer: false;
}


interface CurrentRegistrationPayload {
  id: string;
  staff_id: string;
  organization_id: string;
  started_at: string;
  started_by_user: true;
  status: "active";
  current_kind: RegistrationKind;
  current_label: string;
  source: "user_timer";
  last_gps_classification_at: string | null;
}

interface ActiveResponse {
  timerActive: true;
  timeRegistrationActive: true;
  currentRegistration: CurrentRegistrationPayload | null;
  gpsOnly: false;
  timerId: string;
  startedAt: string;
  elapsedSeconds: number;
  registrationKind: RegistrationKind;
  registrationLabel: string;
  registrationSource: RegistrationSource;
  confidence: number;
  needsUserChoice: boolean;
  canGpsStartTimer: false;
}

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

  // ── 1. SINGLE SOURCE OF TRUTH: current_time_registration ──────────────
  // The app's timer may ONLY run when an active row exists here.
  // GPS may NEVER insert/start this row.
  const { data: currentReg } = await admin
    .from("current_time_registration")
    .select("id, staff_id, organization_id, started_at, started_by_user, status, current_kind, current_label, source, confidence, needs_user_choice, last_gps_classification_at, linked_location_time_entry_id")
    .eq("staff_id", staffId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Backward-compat: if no current_time_registration row exists yet (legacy
  // sessions started before this migration), fall back to the most recent
  // open user-started LTE so existing timers don't appear dead.
  const { data: openEntries } = currentReg ? { data: null } : await admin
    .from("location_time_entries")
    .select("id, entered_at, booking_id, large_project_id, location_id, source")
    .eq("staff_id", staffId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1);

  const active = currentReg
    ? {
        id: currentReg.linked_location_time_entry_id ?? currentReg.id,
        entered_at: currentReg.started_at,
        booking_id: null as string | null,
        large_project_id: null as string | null,
        location_id: null as string | null,
        source: currentReg.source,
      }
    : (openEntries?.[0] ?? null);

  // If we matched via current_time_registration but it carries a linked LTE,
  // hydrate target ids from that LTE so label resolution still works below.
  if (currentReg?.linked_location_time_entry_id) {
    const { data: lte } = await admin
      .from("location_time_entries")
      .select("id, entered_at, booking_id, large_project_id, location_id, source")
      .eq("id", currentReg.linked_location_time_entry_id)
      .maybeSingle();
    if (lte) {
      active!.booking_id = lte.booking_id;
      active!.large_project_id = lte.large_project_id;
      active!.location_id = lte.location_id;
    }
  }

  if (!active) {
    const body: InactiveResponse = {
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
    };
    return json(200, body);
  }


  const startedAt = active.entered_at as string;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );

  // ── 2. Resolve label from the timer's bound target (user-started source) ──
  let registrationLabel = "Okänd plats";
  let registrationKind: RegistrationKind = "unknown_place";
  let registrationSource: RegistrationSource = "user_started";
  let confidence = 0.95;
  let needsUserChoice = false;

  if (active.large_project_id) {
    const { data: lp } = await admin.from("large_projects")
      .select("name").eq("id", active.large_project_id).maybeSingle();
    registrationLabel = lp?.name ?? "Projekt";
    registrationKind = "project";
  } else if (active.booking_id) {
    const { data: b } = await admin.from("bookings")
      .select("client, title, booking_number")
      .eq("id", active.booking_id).maybeSingle();
    registrationLabel = b?.client || b?.title || b?.booking_number || "Bokning";
    registrationKind = "booking";
  } else if (active.location_id) {
    const { data: l } = await admin.from("organization_locations")
      .select("name").eq("id", active.location_id).maybeSingle();
    registrationLabel = l?.name ?? "Plats";
    registrationKind = "warehouse";
  } else {
    // Timer without bound target → ask GPS for hint, but flag for user choice
    registrationKind = "unknown_place";
    registrationLabel = "Okänd plats";
    registrationSource = "gps_classifier";
    confidence = 0.4;
    needsUserChoice = true;

    try {
      const now = new Date();
      const since = new Date(now.getTime() - 90 * 60_000);
      const dateStr = now.toISOString().slice(0, 10);

      const [pingsRes, locsRes, bookingsRes, projectsRes, projCoordsRes, bookingCoordsRes] = await Promise.all([
        admin.from("staff_location_history")
          .select("recorded_at, lat, lng, accuracy")
          .eq("staff_id", staffId)
          .gte("recorded_at", since.toISOString())
          .order("recorded_at", { ascending: true }).limit(500),
        admin.from("organization_locations")
          .select("id, name, latitude, longitude, radius_meters")
          .eq("organization_id", organizationId).limit(500),
        admin.from("bookings")
          .select("id, client, title, booking_number, status")
          .eq("organization_id", organizationId)
          .neq("status", "CANCELLED").limit(500),
        admin.from("large_projects")
          .select("id, name, status")
          .eq("organization_id", organizationId)
          .is("deleted_at", null).limit(300),
        admin.from("large_projects")
          .select("id, address_latitude, address_longitude")
          .eq("organization_id", organizationId).limit(300),
        admin.from("bookings")
          .select("id, delivery_latitude, delivery_longitude")
          .eq("organization_id", organizationId).limit(500),
      ]);

      const bookingCoords = new Map<string, { lat: number; lng: number }>();
      for (const r of (bookingCoordsRes.data ?? []) as any[]) {
        if (r.delivery_latitude != null && r.delivery_longitude != null) {
          bookingCoords.set(String(r.id), { lat: Number(r.delivery_latitude), lng: Number(r.delivery_longitude) });
        }
      }
      const projCoords = new Map<string, { lat: number; lng: number }>();
      for (const r of (projCoordsRes.data ?? []) as any[]) {
        if (r.address_latitude != null && r.address_longitude != null) {
          projCoords.set(String(r.id), { lat: Number(r.address_latitude), lng: Number(r.address_longitude) });
        }
      }
      const TEST_RX = /\b(test|demo)\b|!!|\?\?/i;
      const knownTargets: KnownPlace[] = [];
      for (const l of (locsRes.data ?? []) as any[]) {
        if (l.latitude == null || l.longitude == null) continue;
        if (TEST_RX.test(l.name ?? "")) continue;
        knownTargets.push({
          id: String(l.id), type: "location", name: l.name ?? "Plats",
          lat: Number(l.latitude), lng: Number(l.longitude),
          radiusM: Number(l.radius_meters ?? 100),
        });
      }
      for (const b of (bookingsRes.data ?? []) as any[]) {
        const c = bookingCoords.get(String(b.id));
        if (!c) continue;
        const label = b.client || b.title || b.booking_number || "Bokning";
        if (TEST_RX.test(label)) continue;
        knownTargets.push({ id: String(b.id), type: "booking", name: label, lat: c.lat, lng: c.lng, radiusM: 100 });
      }
      for (const p of (projectsRes.data ?? []) as any[]) {
        const c = projCoords.get(String(p.id));
        if (!c) continue;
        const label = p.name ?? "Projekt";
        if (TEST_RX.test(label)) continue;
        knownTargets.push({ id: String(p.id), type: "project", name: label, lat: c.lat, lng: c.lng, radiusM: 100 });
      }

      const pings = (pingsRes.data ?? []) as any[];
      const gps = buildGpsDayTimelineOnly({
        staffId, organizationId, date: dateStr,
        pings: pings.map((p) => ({
          recorded_at: p.recorded_at, lat: p.lat, lng: p.lng, accuracy: p.accuracy,
        })),
        knownTargets,
      });

      const last = gps.segments[gps.segments.length - 1];
      if (last?.kind === "stay" && last.type === "known_site") {
        registrationLabel = last.label;
        confidence = last.confidence;
        needsUserChoice = false;
        if (last.matchedSiteType === "project") registrationKind = "project";
        else if (last.matchedSiteType === "booking") registrationKind = "booking";
        else if (last.matchedSiteType === "location") registrationKind = "warehouse";
        else registrationKind = "known_site";
      } else if (last?.kind === "travel") {
        registrationLabel = "Förflyttning";
        registrationKind = "transport";
        confidence = last.confidence;
        needsUserChoice = false;
      } else if (last?.kind === "gps_gap") {
        registrationLabel = "GPS osäker";
        registrationKind = "gps_uncertain";
        confidence = 0.2;
        needsUserChoice = true;
      }
    } catch {
      // keep unknown_place fallback
    }
  }

  // If we ran the GPS classifier on an unbound timer, write the latest
  // classification back to current_time_registration. GPS may update
  // current_kind/current_label/confidence/needs_user_choice, but never
  // create the row.
  if (currentReg && registrationSource === "gps_classifier") {
    try {
      await admin
        .from("current_time_registration")
        .update({
          current_kind: registrationKind,
          current_label: registrationLabel,
          confidence,
          needs_user_choice: needsUserChoice,
          last_gps_classification_at: new Date().toISOString(),
        })
        .eq("id", currentReg.id)
        .eq("status", "active");
    } catch (_e) {
      // non-fatal — read path stays correct from in-memory values
    }
  }

  const currentRegistrationPayload: CurrentRegistrationPayload | null = currentReg
    ? {
        id: currentReg.id,
        staff_id: currentReg.staff_id,
        organization_id: currentReg.organization_id,
        started_at: currentReg.started_at,
        started_by_user: true,
        status: "active",
        current_kind: registrationKind,
        current_label: registrationLabel,
        source: "user_timer",
        last_gps_classification_at:
          registrationSource === "gps_classifier"
            ? new Date().toISOString()
            : (currentReg.last_gps_classification_at ?? null),
      }
    : null;

  const body: ActiveResponse = {
    timerActive: true,
    timeRegistrationActive: true,
    currentRegistration: currentRegistrationPayload,
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
  };
  return json(200, body);
});
