// @ts-nocheck
/**
 * backfill-coords
 * ───────────────
 * Geocodes addresses on bookings and standalone projects that are missing
 * delivery_latitude/delivery_longitude. Writes coords back to:
 *   - bookings.delivery_{latitude,longitude}  (trigger propagates to projects)
 *   - projects.delivery_{latitude,longitude}  (only when no booking_id)
 *
 * POST body:
 *   { dryRun?: boolean, limit?: number, organizationId?: string }
 *
 * Auth: requires Supabase user JWT with role admin/manager (RLS-checked via profiles).
 *       Service-role bearer also accepted for one-off ops.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function buildAddress(parts: {
  deliveryaddress?: string | null;
  delivery_postal_code?: string | null;
  delivery_city?: string | null;
}): string | null {
  const a = (parts.deliveryaddress ?? "").trim();
  const z = (parts.delivery_postal_code ?? "").trim();
  const c = (parts.delivery_city ?? "").trim();
  const merged = [a, [z, c].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return merged.length >= 3 ? merged : null;
}

async function geocode(address: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}&region=se&language=sv`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.status !== "OK" || !d.results?.length) return null;
  const { lat, lng } = d.results[0].geometry.location;
  return { lat, lng, formatted: d.results[0].formatted_address };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GOOGLE_KEY) return json(500, { ok: false, error: "GOOGLE_MAPS_API_KEY not configured" });

    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!bearer) return json(401, { ok: false, error: "unauthorized" });

    const isService = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
    let userOrgId: string | null = null;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data: u, error: uErr } = await userClient.auth.getUser();
      if (uErr || !u?.user) return json(401, { ok: false, error: "unauthorized" });
      const { data: prof } = await userClient
        .from("profiles")
        .select("organization_id, role")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!prof?.organization_id) return json(403, { ok: false, error: "no_org" });
      if (!["admin", "manager", "superadmin"].includes(prof.role ?? "")) {
        return json(403, { ok: false, error: "forbidden" });
      }
      userOrgId = prof.organization_id;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dryRun;
    const limit: number = Math.min(Math.max(Number(body?.limit ?? 200), 1), 500);
    const orgFilter: string | null = isService ? (body?.organizationId ?? null) : userOrgId;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // ── 1) Bookings missing coords ──
    let bq = admin
      .from("bookings")
      .select("id, organization_id, deliveryaddress, delivery_postal_code, delivery_city, delivery_latitude, delivery_longitude")
      .or("delivery_latitude.is.null,delivery_longitude.is.null")
      .limit(limit);
    if (orgFilter) bq = bq.eq("organization_id", orgFilter);
    const { data: bookings, error: bErr } = await bq;
    if (bErr) throw bErr;

    // ── 2) Standalone projects (no booking_id) missing coords ──
    let pq = admin
      .from("projects")
      .select("id, organization_id, deliveryaddress, delivery_postal_code, delivery_city, delivery_latitude, delivery_longitude, booking_id")
      .is("booking_id", null)
      .or("delivery_latitude.is.null,delivery_longitude.is.null")
      .is("deleted_at", null)
      .limit(limit);
    if (orgFilter) pq = pq.eq("organization_id", orgFilter);
    const { data: projects, error: pErr } = await pq;
    if (pErr) throw pErr;

    const results: Array<{
      kind: "booking" | "project";
      id: string;
      address: string | null;
      status: "skipped_no_address" | "geocoded" | "geocode_failed" | "would_update" | "updated" | "update_failed";
      lat?: number;
      lng?: number;
      formatted?: string;
      error?: string;
    }> = [];

    let geocoded = 0;
    let updated = 0;
    let skipped = 0;

    const process = async (
      kind: "booking" | "project",
      row: any,
    ) => {
      const address = buildAddress(row);
      if (!address) {
        skipped++;
        results.push({ kind, id: row.id, address: null, status: "skipped_no_address" });
        return;
      }
      const g = await geocode(address);
      if (!g) {
        results.push({ kind, id: row.id, address, status: "geocode_failed" });
        return;
      }
      geocoded++;
      if (dryRun) {
        results.push({ kind, id: row.id, address, status: "would_update", lat: g.lat, lng: g.lng, formatted: g.formatted });
        return;
      }
      const table = kind === "booking" ? "bookings" : "projects";
      const { error: uErr } = await admin
        .from(table)
        .update({ delivery_latitude: g.lat, delivery_longitude: g.lng })
        .eq("id", row.id);
      if (uErr) {
        results.push({ kind, id: row.id, address, status: "update_failed", error: uErr.message });
        return;
      }
      updated++;
      results.push({ kind, id: row.id, address, status: "updated", lat: g.lat, lng: g.lng, formatted: g.formatted });
    };

    for (const b of bookings ?? []) await process("booking", b);
    for (const p of projects ?? []) await process("project", p);

    return json(200, {
      ok: true,
      dryRun,
      organizationId: orgFilter,
      considered: { bookings: bookings?.length ?? 0, standaloneProjects: projects?.length ?? 0 },
      counts: { geocoded, updated, skipped, geocodeFailed: results.filter((r) => r.status === "geocode_failed").length },
      results,
    });
  } catch (e: any) {
    console.error("[backfill-coords] fatal", e);
    return json(500, { ok: false, error: e?.message ?? String(e) });
  }
});
