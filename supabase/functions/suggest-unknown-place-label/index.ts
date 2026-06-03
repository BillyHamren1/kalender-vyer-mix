// suggest-unknown-place-label
// ─────────────────────────────────────────────────────────────────────────────
// Tyst AI-platsnamn för rader som regelmotorn klassat som "unknown_place"
// i tidrapportvyn. Returnerar { label } eller { label: null }.
// Skriver ALDRIG till time_reports / submissions / klassning.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

interface Body {
  staffId?: string;
  date?: string;        // YYYY-MM-DD
  startIso?: string;
  endIso?: string;
  rowKind?: string;     // måste vara "unknown_place"
}

function bad(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  let body: Body;
  try { body = await req.json(); } catch { return bad(400, "invalid_json"); }

  if (!body.staffId || !body.date || !body.startIso || !body.endIso) {
    return bad(400, "missing_fields");
  }
  if (body.rowKind && body.rowKind !== "unknown_place") {
    return bad(422, "ai_only_on_unknown_place");
  }
  if (!LOVABLE_API_KEY) return bad(500, "missing_lovable_api_key");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1) Hämta pings inom radens fönster (lite marginal).
  const startMs = new Date(body.startIso).getTime() - 5 * 60_000;
  const endMs = new Date(body.endIso).getTime() + 5 * 60_000;
  const { data: pingsRaw } = await admin
    .from("staff_location_history")
    .select("recorded_at, lat, lng, accuracy")
    .eq("staff_id", body.staffId)
    .gte("recorded_at", new Date(startMs).toISOString())
    .lte("recorded_at", new Date(endMs).toISOString())
    .order("recorded_at", { ascending: true })
    .limit(500);

  const pings = (pingsRaw ?? []).map((p: any) => ({
    t: String(p.recorded_at),
    lat: Number(p.lat),
    lng: Number(p.lng),
    acc: p.accuracy != null ? Number(p.accuracy) : null,
  }));

  if (pings.length === 0) {
    return new Response(JSON.stringify({ label: null, reason: "no_pings" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Centroid → hämta närliggande kända platser (org_locations) som kontext.
  const cLat = pings.reduce((s, p) => s + p.lat, 0) / pings.length;
  const cLng = pings.reduce((s, p) => s + p.lng, 0) / pings.length;

  let nearby: Array<{ name: string; lat: number; lng: number }> = [];
  try {
    const { data: locs } = await admin
      .from("organization_locations")
      .select("name, latitude, longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(200);
    nearby = (locs ?? [])
      .map((l: any) => ({
        name: String(l.name ?? ""),
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        d: haversineM(cLat, cLng, Number(l.latitude), Number(l.longitude)),
      }))
      .filter((l) => Number.isFinite(l.d) && l.d < 1500)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(({ name, lat, lng }) => ({ name, lat, lng }));
  } catch { /* ignore */ }

  // 3) Reverse-geocode via Mapbox om token finns (extra signal).
  let approxAddress: string | null = null;
  const mapboxToken = Deno.env.get("MAPBOX_PUBLIC_TOKEN") ?? Deno.env.get("MAPBOX_TOKEN");
  if (mapboxToken) {
    try {
      const r = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${cLng},${cLat}.json?access_token=${mapboxToken}&language=sv&limit=1`,
      );
      if (r.ok) {
        const j = await r.json();
        approxAddress = j?.features?.[0]?.place_name ?? null;
      }
    } catch { /* ignore */ }
  }

  // 4) AI-anrop
  const prompt = {
    role: "user" as const,
    content: [
      "Du får GPS-data för ett tidsblock som regelmotorn klassat som okänd plats.",
      "Föreslå EN kort plats-etikett (max 60 tecken) på svenska — t.ex. ett företagsnamn, restaurang, hemadress eller gatuadress.",
      "Inga förklaringar, inga prefix, ingen punkt på slutet. Bara etiketten.",
      "Om du är osäker, svara med tomt fält.",
      "",
      `Tidsfönster: ${body.startIso} → ${body.endIso}`,
      `Centroid: ${cLat.toFixed(5)}, ${cLng.toFixed(5)}`,
      approxAddress ? `Reverse-geocode: ${approxAddress}` : "Ingen reverse-geocode tillgänglig.",
      `Antal pings: ${pings.length}`,
      nearby.length
        ? `Närliggande kända platser (<1.5 km): ${nearby.map((n) => n.name).join(", ")}`
        : "Inga kända platser i närheten.",
    ].join("\n"),
  };

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Du namnger okända GPS-platser i en svensk tidrapport. Svara med en kort etikett eller tomt om osäker.",
        },
        prompt,
      ],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    console.error("[suggest-unknown-place-label] AI gateway error", aiRes.status, txt);
    return new Response(JSON.stringify({ label: null, reason: "ai_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiJson = await aiRes.json();
  let label: string | null = aiJson?.choices?.[0]?.message?.content?.trim() ?? null;
  if (label) {
    label = label.replace(/^["'`]+|["'`.\s]+$/g, "");
    if (label.length > 80) label = label.slice(0, 80);
    if (!label) label = null;
  }

  return new Response(JSON.stringify({ label }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
