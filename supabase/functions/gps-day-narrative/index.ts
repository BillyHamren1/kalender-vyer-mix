// gps-day-narrative
// Arbetsledar-AI som känner organisationens jobb.
// 1. Klienten skickar staff_id + date + redan-städad timeline (stays/moves/gaps).
// 2. Servern hämtar:
//      - planerade jobb idag (staff_assignments × calendar_events × bookings)
//      - andra aktiva org-jobb (projects/large_projects/bookings) i närheten
// 3. Okända stopp matchas mot org-jobb (≤ 500 m) innan reverse-geocode.
// 4. Berikad prompt → Gemini 2.5 Pro.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_PUBLIC_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const AI_TIMEOUT_MS = 60_000;

const NEAR_JOB_RADIUS_M = 500;

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
  nearJob?: { name: string; client: string | null; distanceM: number } | null;
};
type Move = { kind: "move"; start: string; end: string; minutes: number; distanceKm: number };
type Gap = { kind: "gap"; start: string; end: string; minutes: number };
type TimelineEntry = Stay | Move | Gap;

type OrgJob = {
  type: "project" | "large_project" | "booking";
  id: string;
  name: string;
  client: string | null;
  address: string | null;
  lat: number;
  lng: number;
};

type PlannedJob = {
  bookingId: string | null;
  title: string;
  client: string | null;
  address: string | null;
  startIso: string | null;
  endIso: string | null;
  eventType: string | null;
};

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
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
    }).format(new Date(iso));
  } catch { return "—"; }
}
function fmtDur(min: number): string {
  if (!min) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function reverseGeocode(
  lat: number, lng: number,
  cache: Map<string, { poi: string | null; address: string | null }>,
): Promise<{ poi: string | null; address: string | null }> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key); if (hit) return hit;
  if (!MAPBOX_TOKEN) { const e = { poi: null, address: null }; cache.set(key, e); return e; }
  try {
    const poiUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=sv&types=poi&limit=1`;
    const addrUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=sv&types=address&limit=1`;
    const [poiRes, addrRes] = await Promise.all([fetch(poiUrl), fetch(addrUrl)]);
    let poi: string | null = null; let address: string | null = null;
    if (poiRes.ok) {
      const data = await poiRes.json();
      const f = data.features?.[0];
      if (f) {
        const ctx = (f.context ?? []).find((c: any) => /place|locality|neighborhood/.test(c.id))?.text;
        poi = ctx ? `${f.text}, ${ctx}` : f.text ?? null;
      }
    }
    if (addrRes.ok) {
      const data = await addrRes.json();
      const f = data.features?.[0];
      if (f) {
        const parts = String(f.place_name ?? "").split(",").map((s: string) => s.trim());
        address = parts.slice(0, 2).filter(Boolean).join(", ");
      }
    }
    const out = { poi, address }; cache.set(key, out); return out;
  } catch { const e = { poi: null, address: null }; cache.set(key, e); return e; }
}

async function fetchOrgIdForStaff(admin: any, staffId: string): Promise<string | null> {
  const { data } = await admin.from("staff").select("organization_id").eq("id", staffId).maybeSingle();
  return data?.organization_id ?? null;
}

async function fetchPlannedJobs(
  admin: any, orgId: string, staffId: string, date: string,
): Promise<PlannedJob[]> {
  // staff_assignments → team_ids för dagen
  const { data: assigns } = await admin
    .from("staff_assignments")
    .select("team_id")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("assignment_date", date);
  const teamIds = Array.from(new Set((assigns ?? []).map((a: any) => a.team_id).filter(Boolean)));
  if (teamIds.length === 0) return [];

  const { data: events } = await admin
    .from("calendar_events")
    .select("booking_id, title, start_time, end_time, event_type, delivery_address")
    .eq("organization_id", orgId)
    .eq("source_date", date)
    .in("resource_id", teamIds);
  const evs = events ?? [];
  if (evs.length === 0) return [];

  const bookingIds = Array.from(new Set(evs.map((e: any) => e.booking_id).filter(Boolean)));
  const bookingMap = new Map<string, any>();
  if (bookingIds.length > 0) {
    const { data: bks } = await admin
      .from("bookings")
      .select("id, client, deliveryaddress, large_project_id, assigned_project_name, title")
      .in("id", bookingIds);
    for (const b of bks ?? []) bookingMap.set(b.id, b);
  }

  return evs.map((e: any) => {
    const b = e.booking_id ? bookingMap.get(e.booking_id) : null;
    const title = e.title || b?.assigned_project_name || b?.title || b?.client || "Okänt jobb";
    return {
      bookingId: e.booking_id ?? null,
      title,
      client: b?.client ?? null,
      address: e.delivery_address || b?.deliveryaddress || null,
      startIso: e.start_time ?? null,
      endIso: e.end_time ?? null,
      eventType: e.event_type ?? null,
    } satisfies PlannedJob;
  });
}

async function fetchNearbyOrgJobs(admin: any, orgId: string): Promise<OrgJob[]> {
  const out: OrgJob[] = [];
  try {
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, address, address_latitude, address_longitude, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .neq("status", "closed")
      .neq("status", "cancelled")
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(500);
    for (const p of projects ?? []) {
      out.push({
        type: "project", id: p.id, name: p.name,
        client: null, address: p.address ?? null,
        lat: Number(p.address_latitude), lng: Number(p.address_longitude),
      });
    }
  } catch (_e) { /* ignore */ }
  try {
    const { data: lps } = await admin
      .from("large_projects")
      .select("id, name, client, deliveryaddress, delivery_latitude, delivery_longitude, status")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .neq("status", "closed")
      .neq("status", "cancelled")
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(500);
    for (const p of lps ?? []) {
      out.push({
        type: "large_project", id: p.id, name: p.name,
        client: p.client ?? null, address: p.deliveryaddress ?? null,
        lat: Number(p.delivery_latitude), lng: Number(p.delivery_longitude),
      });
    }
  } catch (_e) { /* ignore */ }
  try {
    // Bookings — håll listan kompakt; bara senaste/nära framtiden
    const { data: bks } = await admin
      .from("bookings")
      .select("id, client, deliveryaddress, delivery_latitude, delivery_longitude, status, large_project_id")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(1000);
    for (const b of bks ?? []) {
      if (b.large_project_id) continue; // representeras av large_project
      out.push({
        type: "booking", id: b.id,
        name: b.client || "Bokning",
        client: b.client ?? null, address: b.deliveryaddress ?? null,
        lat: Number(b.delivery_latitude), lng: Number(b.delivery_longitude),
      });
    }
  } catch (_e) { /* ignore */ }
  return out;
}

function findNearestJob(lat: number, lng: number, jobs: OrgJob[]): { job: OrgJob; distanceM: number } | null {
  let best: { job: OrgJob; distanceM: number } | null = null;
  for (const j of jobs) {
    const d = haversineM({ lat, lng }, { lat: j.lat, lng: j.lng });
    if (best === null || d < best.distanceM) best = { job: j, distanceM: d };
  }
  return best;
}

function shouldHideGap(g: Gap, prev: TimelineEntry | undefined, next: TimelineEntry | undefined): boolean {
  // Natt 00–05 lokal tid → hide
  try {
    const startH = Number(new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(new Date(g.start)));
    const endH = Number(new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(new Date(g.end)));
    if (startH >= 0 && endH <= 5) return true;
    if (startH >= 22 && endH <= 5) return true;
  } catch { /* */ }
  if (g.minutes < 60) return true;
  // Mellan två known-site-stays på samma plats
  if (prev?.kind === "stay" && next?.kind === "stay" && prev.known && next.known && prev.name && prev.name === next.name) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const staffId: string = body.staff_id ?? "";
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

    // ---- Kontextberikning ----
    let plannedJobs: PlannedJob[] = [];
    let nearbyJobs: OrgJob[] = [];
    if (staffId && date && SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const orgId = await fetchOrgIdForStaff(admin, staffId);
      if (orgId) {
        const [planned, near] = await Promise.all([
          fetchPlannedJobs(admin, orgId, staffId, date),
          fetchNearbyOrgJobs(admin, orgId),
        ]);
        plannedJobs = planned;
        nearbyJobs = near;
      }
    }

    // Filtrera bort triviala/nattliga gaps från timeline innan vi går vidare
    const filtered: TimelineEntry[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const e = timeline[i];
      if (e.kind === "gap") {
        if (shouldHideGap(e, timeline[i - 1], timeline[i + 1])) continue;
      }
      filtered.push(e);
    }

    // Matcha okända stopp mot org-jobb innan reverse-geocode
    for (const e of filtered) {
      if (e.kind !== "stay") continue;
      if (e.known || e.isPrivate) continue;
      const nearest = nearbyJobs.length ? findNearestJob(e.lat, e.lng, nearbyJobs) : null;
      if (nearest && nearest.distanceM <= NEAR_JOB_RADIUS_M) {
        e.nearJob = { name: nearest.job.name, client: nearest.job.client, distanceM: Math.round(nearest.distanceM) };
      }
    }

    // Reverse-geocode kvarvarande okända stopp utan jobb-match (parallellt)
    const geocodeCache = new Map<string, { poi: string | null; address: string | null }>();
    const toGeocode = filtered.filter(
      (e): e is Stay => e.kind === "stay" && !e.known && !e.isPrivate && !e.nearJob,
    );
    await Promise.all(
      toGeocode.map(async (e) => {
        const { poi, address } = await reverseGeocode(e.lat, e.lng, geocodeCache);
        e.poi = poi; e.address = address;
      }),
    );

    if (!LOVABLE_API_KEY) {
      const top = places[0];
      const fallback = top
        ? `${staffName} var främst på ${top.name} (${fmtDur(top.minutes)}) mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)}.`
        : `${staffName} var aktiv mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)} (${fmtDur(durationMin)}).`;
      return json({ narrative: fallback });
    }

    // ---- Bygg textuell brief för modellen ----
    const plannedLines = plannedJobs.length
      ? plannedJobs.map(p => {
          const t = p.startIso && p.endIso ? `${fmtHm(p.startIso)}–${fmtHm(p.endIso)}` : "tid ej satt";
          const client = p.client ? ` (${p.client})` : "";
          const addr = p.address ? ` @ ${p.address}` : "";
          const phase = p.eventType ? ` [${p.eventType}]` : "";
          return `- ${p.title}${client}${phase}: planerad ${t}${addr}`;
        }).join("\n")
      : "(inga planerade jobb idag enligt schema)";

    const placeLines = places.length
      ? places.map(p => `- ${p.name}: ${fmtDur(p.minutes)}`).join("\n")
      : "(ingen identifierad arbetsplats)";

    const lines: string[] = [];
    for (const e of filtered) {
      if (e.kind === "stay") {
        const label = e.isPrivate
          ? `${e.name ?? "Boende"} [BOENDE/PRIVAT — nämn inte]`
          : e.known
            ? (e.name ?? "Okänd känd plats")
            : (() => {
                if (e.nearJob) return `vid jobbadress för "${e.nearJob.name}"${e.nearJob.client ? ` (${e.nearJob.client})` : ""} (≈${e.nearJob.distanceM} m)`;
                const bits: string[] = [];
                if (e.poi) bits.push(`nära ${e.poi}`);
                if (e.address) bits.push(`(${e.address})`);
                if (!bits.length) bits.push(`okänt stopp (${e.lat.toFixed(4)}, ${e.lng.toFixed(4)})`);
                return bits.join(" ");
              })();
        lines.push(`STOPP ${fmtHm(e.start)}–${fmtHm(e.end)} (${fmtDur(e.minutes)}): ${label}`);
      } else if (e.kind === "move") {
        lines.push(`RESA  ${fmtHm(e.start)}–${fmtHm(e.end)} (${fmtDur(e.minutes)}, ~${e.distanceKm} km)`);
      } else {
        lines.push(`GPS-LUCKA ${fmtHm(e.start)}–${fmtHm(e.end)} (${fmtDur(e.minutes)}) — datatäckning saknas`);
      }
    }

    const system = `Du är en erfaren arbetsledare som känner organisationens jobb och personal. Skriv 3–5 meningar löpande svensk text – ingen punktlista, ingen markdown.

UTGÅ ALLTID FRÅN VAD PERSONEN BORDE GÖRA:
- Du får en lista över personens "Planerade jobb idag". Det är facit. Bekräfta att personen var på rätt plats vid rätt tid, eller flagga avvikelse.
- Du får också okända stopp som är förmatchade mot organisationens närliggande jobb ("vid jobbadress för X"). Använd den informationen direkt — det är inte gissningar.

OM OKÄNDA STOPP UTAN JOBB-MATCH:
- Använd POI/adress (Bauhaus, McDonald's, ICA …) om sådan finns. Spekulera försiktigt om syfte (lunch, materialinköp, tankning) — alltid med "troligen" eller "ser ut som". Korta stopp utan kontext: nämn knappt.

OM GPS-LUCKOR:
- ALDRIG säga "personen sov", "stod stilla", "vilade", "var passiv" eller liknande. En lucka betyder bara att telefonen inte pingade.
- Nämn en lucka ENDAST om den faktiskt bryter ett känt arbetsmönster (t.ex. försvinner mitt under planerat pass). Säg då neutralt "GPS-signal saknas under X" — inget mer.
- Ignorera korta luckor helt. Ignorera nattluckor helt.

TON:
- Konkret, lugn, professionell. Inga flummiga adjektiv ("fundersam start", "mystisk resa"). Inga utfyllnadsord.
- Klockslag (HH:MM) när relevant. Restid/avstånd bara om det säger något.
- Avsluta med "Inga avvikelser." ENDAST när dagen följer planen utan anmärkning. Annars beskriv kort vad som avviker.

Hoppa över boende/privata zoner — nämn dem inte vid namn eller alls.`;

    const user = `Person: ${staffName}
Datum: ${date}
Aktiv (GPS-fönster): ${fmtHm(firstIso)} – ${fmtHm(lastIso)} (totalt ${fmtDur(durationMin)})

PLANERADE JOBB IDAG:
${plannedLines}

Tid registrerad per känd arbetsplats (från GPS-stannande inom geofence):
${placeLines}

DAG-TIDSLINJE (städad — triviala luckor borttagna):
${lines.join("\n")}

Skriv en sammanfattning av dagen utifrån instruktionerna.`;

    const aiAbort = new AbortController();
    const aiTimer = setTimeout(() => aiAbort.abort(), AI_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: aiAbort.signal,
      });
    } catch (e) {
      clearTimeout(aiTimer);
      console.error("[gps-day-narrative] gateway fetch failed/timeout", String(e));
      return json({ error: "ai_timeout", narrative: "AI svarade inte i tid – försök igen." }, 504);
    }
    clearTimeout(aiTimer);
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
