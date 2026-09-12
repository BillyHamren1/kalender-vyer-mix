// Edge Function: analyze-staff-day
// Tar (staff_id, date) och returnerar en AI-analys av dagen baserad på
// pings, time_reports, location_time_entries, travel_time_logs och bookings.
// AI får ALDRIG skriva i DB — endast föreslå.
//
// Auth: kräver inloggad admin (verify_jwt på).
// Multi-tenancy: härleder organization_id från användaren och filtrerar allt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAllStaffLocationPings } from "../_shared/timeEngine/fetchAllStaffLocationPings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Ping {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
}

// Bucket pings to ~50m grid, return one representative per bucket
// to keep reverse-geocoding cheap.
function clusterPings(pings: Ping[]): Ping[] {
  const seen = new Map<string, Ping>();
  for (const p of pings) {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`; // ~110m grid
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=sv`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return j.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

function summarizeMovement(pings: Ping[]): {
  segments: Array<{
    start: string;
    end: string;
    type: "stationary" | "moving";
    avgSpeed: number;
    centerLat: number;
    centerLng: number;
  }>;
} {
  if (pings.length === 0) return { segments: [] };
  const sorted = [...pings].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at)
  );
  const segments: ReturnType<typeof summarizeMovement>["segments"] = [];
  const STATIONARY_SPEED = 1.0; // m/s

  let currentType: "stationary" | "moving" =
    (sorted[0].speed ?? 0) > STATIONARY_SPEED ? "moving" : "stationary";
  let segStart = 0;
  let speedSum = 0;
  let speedCount = 0;
  let latSum = 0;
  let lngSum = 0;

  const flush = (endIdx: number) => {
    const slice = sorted.slice(segStart, endIdx + 1);
    if (slice.length === 0) return;
    segments.push({
      start: slice[0].recorded_at,
      end: slice[slice.length - 1].recorded_at,
      type: currentType,
      avgSpeed: speedCount ? +(speedSum / speedCount).toFixed(2) : 0,
      centerLat: +(latSum / slice.length).toFixed(6),
      centerLng: +(lngSum / slice.length).toFixed(6),
    });
  };

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const sp = p.speed ?? 0;
    const t: "stationary" | "moving" =
      sp > STATIONARY_SPEED ? "moving" : "stationary";
    if (t !== currentType) {
      flush(i - 1);
      currentType = t;
      segStart = i;
      speedSum = 0;
      speedCount = 0;
      latSum = 0;
      lngSum = 0;
    }
    speedSum += sp;
    speedCount++;
    latSum += p.lat;
    lngSum += p.lng;
  }
  flush(sorted.length - 1);
  // Drop micro-segments shorter than 2 minutes
  return {
    segments: segments.filter((s) => {
      const dur =
        (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000;
      return dur >= 2;
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve org from caller
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "No organization for user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const staffId = body?.staff_id as string | undefined;
    const dateStr = body?.date as string | undefined; // YYYY-MM-DD
    if (!staffId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return new Response(
        JSON.stringify({ error: "staff_id and date (YYYY-MM-DD) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Window: local Stockholm day, expressed as UTC
    // Crude: just take 04:00 UTC → 22:00 UTC of date (covers Sweden 06:00–24:00 local in summer)
    // Good enough for analysis context.
    const dayStartIso = `${dateStr}T03:00:00Z`;
    const nextDate = new Date(dateStr + "T00:00:00Z");
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const dayEndIso = nextDate.toISOString().slice(0, 11) + "03:00:00Z";

    // Fetch everything in parallel
    const [
      staffRes,
      reportsRes,
      lteRes,
      travelRes,
      pingsRes,
      workdayRes,
      plannedAssignmentsRes,
      cacheRes,
    ] = await Promise.all([
      admin
        .from("staff_members")
        .select("id, name, role")
        .eq("id", staffId)
        .eq("organization_id", orgId)
        .maybeSingle(),
      admin
        .from("time_reports")
        .select(
          "id, booking_id, large_project_id, location_id, start_time, end_time, hours_worked, source, description",
        )
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .eq("report_date", dateStr)
        .eq("is_subdivision", false),
      admin
        .from("location_time_entries")
        .select(
          "id, booking_id, large_project_id, location_id, entered_at, exited_at, total_minutes, source",
        )
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .eq("entry_date", dateStr),
      admin
        .from("travel_time_logs")
        .select(
          "id, start_time, end_time, hours_worked, from_address, to_address, from_latitude, from_longitude, to_latitude, to_longitude, source, classification, needs_review, destination_booking_id",
        )
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .eq("report_date", dateStr),
      // Replaced inline .limit(2000) — see fetchAllStaffLocationPings call below.
      Promise.resolve({ data: [] as any[], error: null }),
      admin
        .from("workdays")
        .select(
          "id, started_at, ended_at, review_status, review_reasons, notes, admin_note",
        )
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .gte("started_at", dayStartIso)
        .lt("started_at", dayEndIso),
      admin
        .from("booking_staff_assignments")
        .select("booking_id, team_id, role, assignment_date")
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .eq("assignment_date", dateStr),
      admin
        .from("staff_day_report_cache")
        .select(
          "engine_version, summary_json, report_candidate_blocks_json, diagnostics_json, built_at, stale, error",
        )
        .eq("staff_id", staffId)
        .eq("organization_id", orgId)
        .eq("date", dateStr)
        .maybeSingle(),
    ]);

    if (staffRes.error || !staffRes.data) {
      return new Response(JSON.stringify({ error: "Staff not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reports = reportsRes.data || [];
    const ltes = lteRes.data || [];
    const travels = travelRes.data || [];
    const pings = (pingsRes.data || []) as Ping[];
    const workdays = workdayRes.data || [];
    const plannedAssignments = plannedAssignmentsRes.data || [];
    const dayagentCandidate = cacheRes.data || null;

    // Day-wide GPS pings via canonical paginated reader (replaces .limit(2000)).
    const pingsFetch = await fetchAllStaffLocationPings({
      supabaseAdmin: admin,
      organizationId: orgId,
      staffId,
      startUtc: dayStartIso,
      endUtc: dayEndIso,
      select: "recorded_at, lat, lng, accuracy, speed",
    });
    const pingsAll = pingsFetch.rows as Ping[];
    // Override the placeholder above so downstream `pings` references work.
    (pings as any).length = 0;
    (pings as any).push(...pingsAll);

    // Resolve booking + location + large_project labels for context
    const bookingIds = [
      ...new Set([
        ...reports.map((r) => r.booking_id).filter(Boolean),
        ...ltes.map((e) => e.booking_id).filter(Boolean),
        ...travels.map((t) => t.destination_booking_id).filter(Boolean),
        ...plannedAssignments.map((a) => a.booking_id).filter(Boolean),
      ]),
    ] as string[];
    const lpIds = [
      ...new Set([
        ...reports.map((r) => r.large_project_id).filter(Boolean),
        ...ltes.map((e) => e.large_project_id).filter(Boolean),
      ]),
    ] as string[];
    const locIds = [
      ...new Set([
        ...reports.map((r) => r.location_id).filter(Boolean),
        ...ltes.map((e) => e.location_id).filter(Boolean),
      ]),
    ] as string[];

    const [bookingsRes, lpsRes, locsRes] = await Promise.all([
      bookingIds.length
        ? admin
          .from("bookings")
          .select(
            "id, booking_number, client, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate, is_internal, internal_type",
          )
          .in("id", bookingIds)
        : Promise.resolve({ data: [] as any[] }),
      lpIds.length
        ? admin
          .from("large_projects")
          .select("id, name, project_number, event_date")
          .in("id", lpIds)
        : Promise.resolve({ data: [] as any[] }),
      locIds.length
        ? admin
          .from("organization_locations")
          .select("id, name, address, latitude, longitude")
          .in("id", locIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Prefer stationary locations from the whole day, then add a small route sample.
    // Taking only the first clusters hid later projects and lunch/deviation stops.
    const allClusters = clusterPings(pings);
    const stationaryClusters = allClusters
      .filter((p) => (p.speed ?? 0) <= 1)
      .slice(0, 15);
    const movingClusters = allClusters.filter((p) => (p.speed ?? 0) > 1);
    const movingIndexes = movingClusters.length
      ? [0, .25, .5, .75, 1].map((ratio) =>
        Math.min(
          movingClusters.length - 1,
          Math.round((movingClusters.length - 1) * ratio),
        )
      )
      : [];
    const movingSample = [...new Set(movingIndexes)]
      .map((index) => movingClusters[index]);
    const clusters = [...stationaryClusters, ...movingSample].slice(0, 20);
    const geocoded = await Promise.all(
      clusters.map(async (p) => ({
        recorded_at: p.recorded_at,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed,
        address: await reverseGeocode(p.lat, p.lng),
      })),
    );

    const movement = summarizeMovement(pings);

    // Build the AI context (compact JSON the model can read)
    const context = {
      staff: { name: staffRes.data.name, role: staffRes.data.role },
      date: dateStr,
      timezone: "Europe/Stockholm; convert GPS UTC timestamps using this timezone for the requested date",
      time_reports: reports,
      location_time_entries: ltes,
      travel_logs: travels,
      workdays,
      planned_assignments: plannedAssignments,
      dayagent_candidate: dayagentCandidate,
      bookings: bookingsRes.data,
      large_projects: lpsRes.data,
      locations: locsRes.data,
      ping_count: pings.length,
      sampled_ping_locations: geocoded,
      movement_segments: movement.segments,
    };

    const systemPrompt = `Du är Dayagentens oberoende kvalitetsgranskare. Du hjälper en arbetsledare förstå vad som faktiskt hände under en personals arbetsdag.

Du får dagens planerade tilldelningar och bokningar, Dayagentens byggda rapportkandidat, råa GPS-pings sammanfattade som platser/rörelser, tidrapporter, check-ins, resor och arbetsdagar. Planen är en förväntan, GPS är bevis med varierande kvalitet och Dayagentens kandidat är ett förslag — ingen av dem får behandlas som facit ensam.

Tidsregler:
- Tolka alla tider i Europe/Stockholm för det efterfrågade datumet.
- GPS recorded_at är UTC och ska konverteras till lokal tid.
- Hitta inte på hemadress eller arbete efter sista tillförlitliga ping.

Granska alltid uttryckligen:
1. Plan mot faktiskt rörelsemönster: besöktes varje planerat projekt i rimlig ordning och tid?
2. Oplanerade stationära stopp: håll dem separata från angränsande projekt. Ett stopp får aldrig absorberas som projektarbete bara för att personen återvänder dit.
3. Rast/lunch: ett kort stationärt stopp mellan två arbetspass är en rastkandidat, inte automatiskt arbete. Om platsens syfte inte kan avgöras ska den markeras som oklar.
4. Signalbortfall: om pings upphör tydligt före planens eller kandidatens rimliga slut ska det vara en avvikelse med låg säkerhet efter sista ping — inte ett normalt avslut.
5. Lager mot projektplan: om personen stannar på lagret trots planerat projekt ska det vara en planavvikelse.
6. Projektbyte: skilj planerat projektbyte från oplanerad leverans/avstickare.
7. Datakvalitet: flagga saknade pings, långa luckor, dålig noggrannhet, omöjliga hopp och motsägelser.
8. Kandidatfel: flagga när Dayagentens kandidat använder fel projekt, fel kategori, döljer okänd plats, missar ett planerat projekt eller avslutar dagen utan stöd.

Svarskrav:
- Skriv 3–6 korta meningar på svenska i kronologisk ordning.
- Säg uttryckligen "Ingen avvikelse" endast om plan, GPS och kandidat verkligen stämmer överens.
- Vid varje avvikelse ska suggestions innehålla minst en relevant åtgärd. Använd manual_review när beviset inte räcker eller när avvikelsen gäller plan/signal/plats snarare än en säker automatisk korrigering.
- Föreslå aldrig create_time_report för en period efter sista tillförlitliga ping utan annat stöd.
- confidence ska avse analysens säkerhet; signalbortfall eller motstridiga bevis får inte ge high.

Returnera ENDAST via verktyget submit_analysis.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "submit_analysis",
          description: "Submit the day analysis with narrative and suggestions",
          parameters: {
            type: "object",
            properties: {
              narrative: {
                type: "string",
                description:
                  "3-6 meningar på svenska som beskriver dagen baserat på GPS + rapporter.",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
                description:
                  "Hur säker analysen är. low = för lite GPS-data eller motstridiga signaler.",
              },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      enum: [
                        "delete_travel",
                        "split_travel",
                        "create_time_report",
                        "reclassify_travel",
                        "manual_review",
                      ],
                    },
                    target_id: {
                      type: "string",
                      description:
                        "ID på raden som föreslås ändras (travel/time_report/LTE), eller tom sträng om det är en ny rad.",
                    },
                    reason: {
                      type: "string",
                      description:
                        "Kort motivering på svenska, max 2 meningar.",
                    },
                    proposed_data: {
                      type: "object",
                      description:
                        "Föreslagna fältvärden om relevant (t.ex. start_time, end_time, classification).",
                      additionalProperties: true,
                    },
                  },
                  required: ["action", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["narrative", "confidence", "suggestions"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiBody = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analysera följande dagdata och returnera via submit_analysis:\n\n${
            JSON.stringify(context, null, 2)
          }`,
        },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "submit_analysis" } },
    };

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiBody),
      },
    );

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit, försök igen om en stund." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({
          error: "AI-krediter slut. Lägg till krediter i workspace.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, text);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const toolCall =
      aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let analysis: any = null;
    try {
      analysis = toolCall ? JSON.parse(toolCall) : null;
    } catch (e) {
      console.error("Failed to parse AI tool args:", e, toolCall);
    }

    if (!analysis) {
      return new Response(
        JSON.stringify({
          error: "AI returnerade inget strukturerat svar",
          raw: aiJson,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        analysis,
        context_summary: {
          ping_count: pings.length,
          movement_segments: movement.segments.length,
          time_reports: reports.length,
          location_entries: ltes.length,
          travel_logs: travels.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("analyze-staff-day error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
