// @ts-nocheck
/**
 * get-staff-presence
 * ────────────────────────────────────────────────────────────────────────────
 * Admin presence view — answers "where is each staff member RIGHT NOW?".
 *
 * Reads ONLY from new sources:
 *   - staff_members              (roster + organization_id)
 *   - staff_location_history     (last GPS ping per staff)
 *   - active_time_registrations  (active timer, if any)
 *   - organization_locations     (warehouses / fixed locations)
 *   - projects                   (standalone projects with coordinates)
 *   - large_projects             (project-level address geofence)
 *
 * MUST NOT read or write:
 *   - workdays / time_reports / location_time_entries / travel_time_logs
 *   - assistant_events / workday_flags / day_attestations
 *
 * Auth: Supabase JWT (admin web user) OR service-role bearer.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SIGNAL_LIVE_SEC = 120;       // < 2 min
const SIGNAL_RECENT_SEC = 600;     // < 10 min
const SIGNAL_STALE_SEC = 3600;     // < 60 min
const TRANSPORT_SPEED_MPS = 2.5;   // ~9 km/h

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Target {
  kind: "warehouse" | "project" | "large_project";
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius: number;
}

function classifySignal(ageSec: number | null): "live" | "recent" | "stale" | "no_signal" {
  if (ageSec == null) return "no_signal";
  if (ageSec < SIGNAL_LIVE_SEC) return "live";
  if (ageSec < SIGNAL_RECENT_SEC) return "recent";
  if (ageSec < SIGNAL_STALE_SEC) return "stale";
  return "no_signal";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ─── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!bearer) return json(401, { ok: false, error: "unauthorized" });

  const okSvc = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
  let userOrgId: string | null = null;
  if (!okSvc) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return json(401, { ok: false, error: "unauthorized" });
      // Resolve org via profiles
      const { data: prof } = await userClient
        .from("profiles")
        .select("organization_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      userOrgId = prof?.organization_id ?? null;
    } catch {
      return json(401, { ok: false, error: "unauthorized" });
    }
    if (!userOrgId) return json(403, { ok: false, error: "no_org" });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const orgFilter = (qb: any) =>
    okSvc && body?.organizationId
      ? qb.eq("organization_id", body.organizationId)
      : userOrgId
      ? qb.eq("organization_id", userOrgId)
      : qb;

  const orgId = okSvc ? (body?.organizationId ?? null) : userOrgId;
  if (!orgId) return json(400, { ok: false, error: "organizationId_required_for_service_role" });

  // ─── Roster ──────────────────────────────────────────────────────────────
  const { data: staff, error: staffErr } = await admin
    .from("staff_members")
    .select("id, name, organization_id, is_active")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (staffErr) return json(500, { ok: false, error: `staff_fetch_failed: ${staffErr.message}` });
  const staffList = staff ?? [];
  if (staffList.length === 0) return json(200, { ok: true, presence: [] });

  const staffIds = staffList.map((s: any) => s.id);

  // ─── Targets (warehouses + active projects + large_projects) ─────────────
  const targets: Target[] = [];

  const { data: locs } = await admin
    .from("organization_locations")
    .select("id, name, latitude, longitude, radius_meters")
    .eq("organization_id", orgId);
  for (const l of locs ?? []) {
    if (typeof l.latitude === "number" && typeof l.longitude === "number") {
      targets.push({
        kind: "warehouse",
        id: l.id,
        label: l.name ?? "Lager",
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        radius: Number(l.radius_meters ?? 100),
      });
    }
  }

  try {
    const { data: projs } = await admin
      .from("projects")
      .select("id, name, address_latitude, address_longitude, address_radius_meters, status")
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
      .neq("status", "closed");
    for (const p of projs ?? []) {
      if (typeof p.address_latitude === "number" && typeof p.address_longitude === "number") {
        targets.push({
          kind: "project",
          id: p.id,
          label: p.name ?? "Projekt",
          lat: Number(p.address_latitude),
          lng: Number(p.address_longitude),
          radius: Number(p.address_radius_meters ?? 150),
        });
      }
    }
  } catch (_) { /* projects table may have different schema; ignore */ }

  try {
    const { data: lps } = await admin
      .from("large_projects")
      .select("id, name, address_latitude, address_longitude, address_radius_meters, status")
      .eq("organization_id", orgId);
    for (const p of lps ?? []) {
      if (typeof p.address_latitude === "number" && typeof p.address_longitude === "number") {
        if (p.status === "cancelled" || p.status === "archived") continue;
        targets.push({
          kind: "large_project",
          id: p.id,
          label: p.name ?? "Storprojekt",
          lat: Number(p.address_latitude),
          lng: Number(p.address_longitude),
          radius: Number(p.address_radius_meters ?? 200),
        });
      }
    }
  } catch (_) { /* ignore */ }

  // ─── Latest pings per staff (one row each) ───────────────────────────────
  // staff_location_history is large — fetch last 24h then take newest per staff.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const pingMap = new Map<string, { lat: number; lng: number; speed: number | null; recorded_at: string }>();
  // Chunk staffIds in IN clauses if large
  const chunkSize = 50;
  for (let i = 0; i < staffIds.length; i += chunkSize) {
    const chunk = staffIds.slice(i, i + chunkSize);
    const { data: pings } = await admin
      .from("staff_location_history")
      .select("staff_id, lat, lng, speed, recorded_at")
      .eq("organization_id", orgId)
      .in("staff_id", chunk)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(1000);
    for (const p of pings ?? []) {
      if (!pingMap.has(p.staff_id)) {
        pingMap.set(p.staff_id, {
          lat: Number(p.lat),
          lng: Number(p.lng),
          speed: p.speed == null ? null : Number(p.speed),
          recorded_at: p.recorded_at,
        });
      }
    }
  }

  // ─── Active registrations per staff ──────────────────────────────────────
  const regMap = new Map<string, any>();
  for (let i = 0; i < staffIds.length; i += chunkSize) {
    const chunk = staffIds.slice(i, i + chunkSize);
    const { data: regs } = await admin
      .from("active_time_registrations")
      .select(
        "id, staff_id, status, started_at, start_source, start_target_label, current_label, current_kind, current_target_type, auto_started",
      )
      .eq("organization_id", orgId)
      .eq("status", "active")
      .in("staff_id", chunk);
    for (const r of regs ?? []) {
      regMap.set(r.staff_id, r);
    }
  }

  // ─── Latest arrival/departure per staff (last 24h) ───────────────────────
  const arrivalMap = new Map<string, any>();
  const departureMap = new Map<string, any>();
  for (let i = 0; i < staffIds.length; i += chunkSize) {
    const chunk = staffIds.slice(i, i + chunkSize);
    const { data: events } = await admin
      .from("staff_presence_events")
      .select("staff_id, event_type, target_type, target_id, target_label, event_at")
      .eq("organization_id", orgId)
      .in("staff_id", chunk)
      .in("event_type", ["arrival", "departure"])
      .gte("event_at", since)
      .order("event_at", { ascending: false })
      .limit(2000);
    for (const ev of events ?? []) {
      if (ev.event_type === "arrival" && !arrivalMap.has(ev.staff_id)) {
        arrivalMap.set(ev.staff_id, ev);
      } else if (ev.event_type === "departure" && !departureMap.has(ev.staff_id)) {
        departureMap.set(ev.staff_id, ev);
      }
    }
  }

  // ─── Build presence rows ─────────────────────────────────────────────────
  const now = Date.now();
  const presence = staffList.map((s: any) => {
    const ping = pingMap.get(s.id) ?? null;
    const reg = regMap.get(s.id) ?? null;
    const lastArrival = arrivalMap.get(s.id) ?? null;
    const lastDeparture = departureMap.get(s.id) ?? null;

    const ageSec = ping
      ? Math.max(0, Math.floor((now - new Date(ping.recorded_at).getTime()) / 1000))
      : null;
    const signal = classifySignal(ageSec);

    let matched: { target: Target; distance: number } | null = null;
    if (ping) {
      let best: { target: Target; distance: number } | null = null;
      for (const t of targets) {
        const d = haversineMeters(ping.lat, ping.lng, t.lat, t.lng);
        if (d <= t.radius) {
          if (!best || d < best.distance) best = { target: t, distance: d };
        }
      }
      matched = best;
    }

    let interpreted:
      | "på event"
      | "på lager"
      | "transport"
      | "okänd plats"
      | "GPS-glapp" = "okänd plats";

    if (reg && (signal === "stale" || signal === "no_signal")) {
      interpreted = "GPS-glapp";
    } else if (matched) {
      interpreted = matched.target.kind === "warehouse" ? "på lager" : "på event";
    } else if (ping && ping.speed != null && ping.speed > TRANSPORT_SPEED_MPS) {
      interpreted = "transport";
    } else {
      interpreted = "okänd plats";
    }

    const targetLabel = matched
      ? matched.target.label
      : reg
      ? reg.current_label ?? reg.start_target_label ?? "Okänd plats"
      : "Okänd plats";

    // Determine arrival/departure to show:
    // - if onSite (matched), show last arrival to that target.
    // - else, show last departure that happened after last arrival.
    const arrivalAt = lastArrival?.event_at ?? null;
    const departureAt = lastDeparture?.event_at ?? null;
    const stillOnSite =
      !!arrivalAt &&
      (!departureAt || new Date(departureAt).getTime() < new Date(arrivalAt).getTime());

    return {
      staffId: s.id,
      name: s.name,
      lastPingAt: ping?.recorded_at ?? null,
      pingAgeSec: ageSec,
      signal,
      interpretedStatus: interpreted,
      targetLabel,
      matchedTarget: matched
        ? {
            kind: matched.target.kind,
            id: matched.target.id,
            label: matched.target.label,
            distanceMeters: Math.round(matched.distance),
          }
        : null,
      arrival: arrivalAt
        ? {
            at: arrivalAt,
            targetLabel: lastArrival.target_label,
            targetType: lastArrival.target_type,
            stillOnSite,
          }
        : null,
      departure: departureAt
        ? {
            at: departureAt,
            targetLabel: lastDeparture.target_label,
            targetType: lastDeparture.target_type,
            isLatest: !stillOnSite,
          }
        : null,
      activeTimer: reg
        ? {
            active: true,
            id: reg.id,
            startedAt: reg.started_at,
            startSource: reg.start_source,
            currentLabel: reg.current_label ?? reg.start_target_label,
            currentKind: reg.current_kind,
            autoStarted: !!reg.auto_started,
          }
        : { active: false },
    };
  });

  return json(200, {
    ok: true,
    organizationId: orgId,
    generatedAt: new Date().toISOString(),
    targetsConsidered: targets.length,
    presence,
  });
});
