// gps-day-narrative
// Tar emot en sammanfattning av en staffs GPS-dag (ren payload — vi gör
// ingen tolkning här) och returnerar en kort, naturlig svensk beskrivning.
//
// POST body:
// {
//   staff_name: string,
//   date: "yyyy-MM-dd",
//   first_iso: string | null,
//   last_iso: string | null,
//   duration_min: number,
//   places: [{ name, minutes }],
//   visits: [{ name, start, end, minutes, is_private }]
// }
//
// Response: { narrative: string }

import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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
    const visits: Array<{ name: string; start: string; end: string; minutes: number; is_private?: boolean }> =
      Array.isArray(body.visits) ? body.visits : [];

    if (!firstIso || !lastIso || (!places.length && !visits.length)) {
      return json({ narrative: "Inga GPS-data för dagen." });
    }

    if (!LOVABLE_API_KEY) {
      // Fallback utan AI – enkel sammanfattning
      const top = places[0];
      const fallback = top
        ? `${staffName} var främst på ${top.name} (${fmtDur(top.minutes)}) mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)}.`
        : `${staffName} var aktiv mellan ${fmtHm(firstIso)} och ${fmtHm(lastIso)} (${fmtDur(durationMin)}).`;
      return json({ narrative: fallback });
    }

    const visitLines = visits.slice(0, 30).map(v =>
      `- ${fmtHm(v.start)}–${fmtHm(v.end)} (${fmtDur(v.minutes)}) ${v.name}${v.is_private ? " [PRIVAT/BOENDE]" : ""}`
    ).join("\n");
    const placeLines = places.map(p => `- ${p.name}: ${fmtDur(p.minutes)}`).join("\n");

    const system = `Du är en arbetsledar-assistent. Skriv EN kort, neutral svensk mening (max 2 meningar, ~200 tecken) som sammanfattar en persons arbetsdag baserat på GPS-besök. Använd klockslag (HH:MM) och projektnamn. Nämn rimliga avvikelser (t.ex. lunch om en kort 30–60 min lucka mitt på dagen utanför projektet) försiktigt och spekulera inte om okända platser. Avsluta med "Inga avvikelser." om allt ser normalt ut. Skriv på svenska. Ingen punktlista, ingen markdown.`;

    const user = `Person: ${staffName}
Datum: ${date}
Första aktivitet: ${fmtHm(firstIso)}
Sista aktivitet: ${fmtHm(lastIso)}
Total tid: ${fmtDur(durationMin)}

Tid per plats:
${placeLines || "(ingen identifierad arbetsplats)"}

Tidslinje (besök inom kända geofences):
${visitLines || "(inga besök)"}

Skriv sammanfattningen.`;

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
        temperature: 0.3,
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
