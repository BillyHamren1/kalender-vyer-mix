// get-current-time-registration
// ─────────────────────────────────────────────────────────────────────────────
// Backend-styrt svar på: "Vad registreras min tid på just nu?"
//
// REGEL:
//   * GPS får UPPDATERA label/kind/confidence på en aktiv användarstartad timer.
//   * GPS får ALDRIG starta en timer.
//   * Label och kind kommer från GPS-motorns senaste klassificering — inte
//     från useWorkSession, location_time_entries eller time_reports.
//
// Output:
//   timerActive: false  → { label: "Tid registreras inte", kind: "none",
//                            canGpsCreateTime: false }
//   timerActive: true   → { timerStartedAt, label, kind, confidence,
//                            needsUserChoice }
//
// Auth: dual (mobile token eller Supabase JWT) via _shared/staff-auth.

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

interface InactiveResponse {
  timerActive: false;
  label: string;
  kind: "none";
  canGpsCreateTime: false;
}

interface ActiveResponse {
  timerActive: true;
  timerStartedAt: string;
  timerId: string;
  label: string;
  kind: RegistrationKind;
  confidence: number;
  needsUserChoice: boolean;
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

  // Resolve staffId from auth (mobile = direct, jwt = lookup)
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

  // ── 1. Aktiv user-startad timer? ──────────────────────────────────────
  // En aktiv timer = location_time_entries med exited_at IS NULL.
  // Detta är ENDA källan för "är timer igång?". GPS skapar inte rader här.
  const { data: openEntries } = await admin
    .from("location_time_entries")
    .select("id, entered_at, booking_id, large_project_id, location_id, source")
    .eq("staff_id", staffId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1);

  const active = openEntries?.[0] ?? null;

  if (!active) {
    const body: InactiveResponse = {
      timerActive: false,
      label: "Tid registreras inte",
      kind: "none",
      canGpsCreateTime: false,
    };
    return json(200, body);
  }

  // ── 2. Aktiv timer → fråga GPS-motorn om aktuell klassificering ──────
  // Vi kör samma pure GPS-only-bygge som debug-vyn, men på de senaste 90 min.
  const now = new Date();
  const since = new Date(now.getTime() - 90 * 60_000);
  const dateStr = now.toISOString().slice(0, 10);

  const [pingsRes, locsRes, bookingsRes, projectsRes, projCoordsRes, bookingCoordsRes] = await Promise.all([
    admin.from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy")
      .eq("staff_id", staffId)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true })
      .limit(500),
    admin.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters")
      .eq("organization_id", organizationId).limit(500),
    admin.from("bookings")
      .select("id, client, title, booking_number, status, eventdate, rigdaydate, rigdowndate")
      .eq("organization_id", organizationId)
      .neq("status", "CANCELLED")
      .limit(500),
    admin.from("large_projects")
      .select("id, name, status, start_date, end_date")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .limit(300),
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

  // Senaste segmentet säger var användaren är NU
  const last = gps.segments[gps.segments.length - 1];

  let label = "Okänd plats";
  let kind: RegistrationKind = "unknown_place";
  let confidence = 0.4;
  let needsUserChoice = true;

  if (!last) {
    label = "GPS osäker";
    kind = "gps_uncertain";
    confidence = 0.2;
    needsUserChoice = true;
  } else if (last.kind === "stay" && last.type === "known_site") {
    label = last.label;
    confidence = last.confidence;
    needsUserChoice = false;
    if (last.matchedSiteType === "project") kind = "project";
    else if (last.matchedSiteType === "booking") kind = "booking";
    else if (last.matchedSiteType === "location") kind = "warehouse";
    else kind = "known_site";
  } else if (last.kind === "travel") {
    label = "Förflyttning";
    kind = "transport";
    confidence = last.confidence;
    needsUserChoice = false;
  } else if (last.kind === "gps_gap") {
    label = "GPS osäker";
    kind = "gps_uncertain";
    confidence = 0.2;
    needsUserChoice = true;
  } else {
    label = "Okänd plats";
    kind = "unknown_place";
    confidence = last.confidence;
    needsUserChoice = true;
  }

  const body: ActiveResponse = {
    timerActive: true,
    timerId: String(active.id),
    timerStartedAt: active.entered_at,
    label,
    kind,
    confidence,
    needsUserChoice,
  };
  return json(200, body);
});
