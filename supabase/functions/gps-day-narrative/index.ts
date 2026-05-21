// gps-day-narrative
// Nyfiken AI-sammanfattning av en persons GPS-dag.
// 1. Tar emot komplett dygnstidslinje (stays + moves, inkl. okända stopp)
// 2. Reverse-geocodar okända stopp via Mapbox (POI + adress)
// 3. Skickar berikat material till Gemini 2.5 Pro med en arbetsledar-prompt
//    som uppmuntras vara nyfiken och resonera om syfte (lunch, ärende, hem...).

import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_PUBLIC_TOKEN") ?? "";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

type Stay = {
  kind: "stay";
  name: string | null;
  known: boolean;
  isPrivate: boolean;
  lat: number;
  lng: number;
  start: string;
  end: string;
  minutes: number;
  poi?: string | null;
  address?: string | null;
};
type Move = {
  kind: "move";
  start: string;
  end: string;
  minutes: number;
  distanceKm: number;
};
type TimelineEntry = Stay | Move;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtHm(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Stockholm",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fmtDur(min: number): string {
  if (!min) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

async function reverseGeocode(
  lat: number,
  lng: number,
  cache: Map<string, { poi: string | null; address: string | null }>,
): Promise<{ poi: string | null; address: string | null }> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!MAPBOX_TOKEN) {
    const empty = { poi: null, address: null };
    cache.set(key, empty);
    return empty;
  }
  try {
    // POI först — vi vill helst veta "Bauhaus Sickla", "McDonald's", "Circle K"
    const poiUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=sv&types=poi&limit=1`;
    const addrUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=sv&types=address&limit=1`;
    const [poiRes, addrRes] = await Promise.all([fetch(poiUrl), fetch(addrUrl)]);
    let poi: string | null = null;
    let address: string | null = null;
    if (poiRes.ok) {
      const data = await poiRes.json();
      const f = data.features?.[0];
      if (f) {
        // Foursquare/POI: feature.text = "Bauhaus", place_name innehåller stadsdel
        const ctx = (f.context ?? []).find((c: any) => /place|locality|neighborhood/.test(c.id))?.text;
        poi = ctx ? `${f.text}, ${ctx}` : f.text ?? null;
      }
    }
    if (addrRes.ok) {
      const data = await addrRes.json();
      const f = data.features?.[0];
      if (f) {
        const parts = String(f.place_name ?? "").split(",").map((s: string) => s.trim());
        // street, postalArea, country -> "Värmdövägen 84, Nacka"
        address = parts.slice(0, 2).filter(Boolean).join(", ");
      }
    }
    const out = { poi, address };
    cache.set(key, out);
    return out;
  } catch (_e) {
    const empty = { poi: null, address: null };
    cache.set(key, empty);
    return empty;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const staffName: string = body.staff_name ?? "Personen";
    const date: string = body.date ?? "";
    const firstIso: string | null = body.first_iso ?? null;
    const lastIso: string | null = body.last_iso ?? null;
    const durationMin: number = Number(body.duration_min ?? 0);
    const places: Array<{ name: string; minutes: number }> = Array.isArray(body.places) ? body.places : [];
    const timeline: TimelineEntry[] = Array.isArray(body.timeline) ? body.timeline : [];

    if (!firstIso || !lastIso || timeline.length === 0) {
      return json({ narrative: "Inga GPS-data för dagen." });
    }

    // Reverse-geocode alla okända, icke-privata stopp (>= 8 min — redan filtrerat klientsidan).
    const geocodeCache = new Map<string, { poi: string | null; address: string | null }>();
    for (const entry of timeline) {
      if (entry.kind !== "stay") continue;
      if (entry.known || entry.isPrivate) continue;
      const { poi, address } = await reverseGeocode(entry.lat, entry.lng, geocodeCache);
      entry.poi = poi;
      entry.address = address;
    }

    if (!LOVABLE_API_KEY) {
      const top = places[0];
      const fallback = top
        ? `${staffName} var främst på ${top.name} (${fmtDur(top.minutes)}) mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)}.`
        : `${staffName} var aktiv mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)} (${fmtDur(durationMin)}).`;
      return json({ narrative: fallback });
    }

    // Bygg textuell tidslinje för modellen.
    const lines: string[] = [];
    for (const e of timeline) {
      if (e.kind === "stay") {
        const label = e.isPrivate
          ? `${e.name ?? "Boende"} [BOENDE/PRIVAT]`
          : e.known
            ? (e.name ?? "Okänd känd plats")
            : (() => {
                const bits: string[] = [];
                if (e.poi) bits.push(`nära ${e.poi}`);
                if (e.address) bits.push(`(${e.address})`);
                if (!bits.length) bits.push(`okänt stopp (${e.lat.toFixed(4)}, ${e.lng.toFixed(4)})`);
                return bits.join(" ");
              })();
        lines.push(`STOPP ${fmtHm(e.start)}–${fmtHm(e.end)} (${fmtDur(e.minutes)}): ${label}`);
      } else {
        lines.push(`RESA  ${fmtHm(e.start)}–${fmtHm(e.end)} (${fmtDur(e.minutes)}, ~${e.distanceKm} km)`);
      }
    }
    const placeLines = places.map(p => `- ${p.name}: ${fmtDur(p.minutes)}`).join("\n");

    const system = `Du är en erfaren och NYFIKEN arbetsledare som läser en persons GPS-dag.
Skriv 3–5 meningar löpande svensk text — ingen punktlista, ingen markdown.
Var INTRESSERAD av rörelserna och resonera om vad de betyder. Använd POI-namn och adresser när du beskriver okända stopp ("ett 35 min stopp vid Bauhaus Sickla — troligen materialinköp").
Spekulera FÖRSIKTIGT om syfte när längd, plats och tidpunkt gör det rimligt (lunch, fika, tankning, materialhämtning, hem) — men hedga alltid med "troligen", "ser ut som" eller "verkar".
Använd klockslag (HH:MM) och nämn restider/avstånd när det är intressant.
Markera tydligt om något ser avvikande ut (oväntat lång lucka, sent slut, mycket körning fram och tillbaka, stopp på underliga ställen). Avsluta med "Inga avvikelser." ENDAST när allt verkligen ser normalt ut.
Hoppa över boende/privata zoner — nämn dem inte vid namn.
Skriv som om du faktiskt funderar på dagen, inte som en torr rapport.`;

    const user = `Person: ${staffName}
Datum: ${date}
Aktiv: ${fmtHm(firstIso)} – ${fmtHm(lastIso)} (totalt ${fmtDur(durationMin)})

Tid per känd arbetsplats:
${placeLines || "(ingen identifierad arbetsplats)"}

Komplett dygnstidslinje (stays + förflyttningar):
${lines.join("\n")}

Skriv en nyfiken sammanfattning av dagen.`;

    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (resp.status === 429) return json({ error: "rate_limited", narrative: "AI är upptagen – försök igen om en stund." }, 429);
    if (resp.status === 402) return json({ error: "credits_exhausted", narrative: "AI-krediter slut." }, 402);
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[gps-day-narrative] gateway error", resp.status, txt.slice(0, 200));
      return json({ error: "ai_gateway_error", narrative: "Kunde inte generera sammanfattning." }, 500);
    }
    const data = await resp.json();
    const narrative: string = (data?.choices?.[0]?.message?.content ?? "").toString().trim();
    return json({ narrative: narrative || "Ingen sammanfattning tillgänglig." });
  } catch (err) {
    console.error("[gps-day-narrative]", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
