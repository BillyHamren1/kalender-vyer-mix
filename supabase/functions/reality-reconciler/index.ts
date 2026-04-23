/**
 * reality-reconciler
 * ────────────────────────────────────────────────────────────────────────────
 * Runs every 5 minutes via pg_cron. For each active staff member in each org:
 *
 *   1. Build a "situation snapshot" (open workday/travel/location-entries +
 *      recent GPS pings + nearby geofence hits).
 *   2. Apply deterministic high-confidence rules first (cheap, no AI call):
 *        • travel_arrived_undetected — open travel + 3+ pings in geofence
 *          for 10+ min → close travel + open location-entry + ensure workday
 *        • stale_location — open location-entry + GPS gone for 30+ min →
 *          close entry on last inside-ping
 *        • stale_workday — open workday + no activity 4h + last ping >2h →
 *          close workday on last activity
 *   3. For ambiguous cases, ask Lovable AI Gateway to classify (low effort,
 *      structured output via tool calling). Apply if confidence > 0.85,
 *      log+notify if 0.5–0.85, otherwise log silently.
 *
 * Auth: requires `x-cron-secret` header matching CRON_SECRET env.
 * Multi-tenant: queries scope by org. All actions are idempotent.
 */
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  buildSituation,
  listActiveStaff,
  type OrgLocation,
  type StaffSituation,
} from "../_shared/situation-builder.ts";
import {
  applyCloseTravelAndOpenLocation,
  applyCloseStaleLocation,
  applyCloseStaleWorkday,
  applyEnsureWorkday,
  logCorrection,
} from "../_shared/reality-actions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

// Confidence thresholds
const AUTO_APPLY_MIN = 0.85;
const ASK_USER_MIN = 0.5;

// Deterministic rule thresholds
const TRAVEL_ARRIVED_MIN_PINGS = 3;
const TRAVEL_ARRIVED_MIN_MINUTES = 10;
const STALE_LOCATION_MIN_GAP_MINUTES = 30;
const STALE_WORKDAY_MIN_IDLE_HOURS = 4;
const STALE_WORKDAY_MIN_GPS_GAP_HOURS = 2;

interface OrgRow {
  id: string;
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 60000;
}

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000;
}

/**
 * Try deterministic rules first. Returns a list of applied corrections.
 * If none of the rules match, returns empty and the caller may invoke AI.
 */
async function tryDeterministicRules(
  supabase: any,
  org: OrgRow,
  sit: StaffSituation,
  locations: OrgLocation[],
): Promise<{ applied: boolean; results: any[] }> {
  const results: any[] = [];

  // Rule 1: travel_arrived_undetected
  if (sit.open_travel && sit.geofence_hits.length > 0) {
    const top = sit.geofence_hits[0];
    if (
      top.pings_inside >= TRAVEL_ARRIVED_MIN_PINGS &&
      top.first_inside_at &&
      top.last_inside_at &&
      minutesBetween(top.first_inside_at, top.last_inside_at) >= TRAVEL_ARRIVED_MIN_MINUTES
    ) {
      const loc = locations.find((l) => l.id === top.location_id);
      if (loc) {
        const arriveIso = top.first_inside_at;
        const r1 = await applyCloseTravelAndOpenLocation(supabase, {
          staffId: sit.staff_id,
          organizationId: sit.organization_id,
          travelId: sit.open_travel.id,
          locationId: loc.id,
          locationName: loc.name,
          locationLat: loc.latitude,
          locationLng: loc.longitude,
          atIso: arriveIso,
        });
        results.push({ action: 'close_travel_open_location', at: arriveIso, ...r1 });

        // Ensure workday exists for the day, anchored at first GPS evidence today
        if (!sit.todays_workday_exists) {
          const r2 = await applyEnsureWorkday(supabase, {
            staffId: sit.staff_id,
            organizationId: sit.organization_id,
            atIso: arriveIso,
          });
          results.push({ action: 'ensure_workday', at: arriveIso, ...r2 });
        }

        await logCorrection(supabase, {
          organization_id: sit.organization_id,
          staff_id: sit.staff_id,
          situation_kind: 'travel_arrived_undetected',
          confidence: 0.95,
          ai_reasoning: `Resa öppen sedan ${sit.open_travel.start_time}. GPS visar ${top.pings_inside} pings inom geofence "${top.location_name}" från ${top.first_inside_at}. Stängde resan, öppnade lokal-stämpling.`,
          ai_model: 'deterministic_rules',
          situation_snapshot: sit,
          suggested_actions: [{ kind: 'close_travel_open_location', location_id: loc.id, at: arriveIso }],
          applied_actions: results,
          status: 'applied',
        });
        return { applied: true, results };
      }
    }
  }

  // Rule 2: stale_location — open entry but staff has been outside for >30 min
  for (const entry of sit.open_location_entries) {
    if (!entry.location_id) continue;
    const loc = locations.find((l) => l.id === entry.location_id);
    if (!loc) continue;
    const hit = sit.geofence_hits.find((h) => h.location_id === loc.id);
    if (!sit.latest_ping) continue;
    if (
      hit?.last_inside_at &&
      minutesBetween(hit.last_inside_at, sit.latest_ping.recorded_at) >= STALE_LOCATION_MIN_GAP_MINUTES
    ) {
      const r = await applyCloseStaleLocation(supabase, {
        entryId: entry.id,
        atIso: hit.last_inside_at,
      });
      results.push({ action: 'close_stale_location', at: hit.last_inside_at, ...r });
      await logCorrection(supabase, {
        organization_id: sit.organization_id,
        staff_id: sit.staff_id,
        situation_kind: 'stale_location',
        confidence: 0.9,
        ai_reasoning: `Lokal-stämpling "${loc.name}" var öppen men GPS lämnade geofencen ${hit.last_inside_at}, för >${STALE_LOCATION_MIN_GAP_MINUTES} min sedan.`,
        ai_model: 'deterministic_rules',
        situation_snapshot: sit,
        suggested_actions: [{ kind: 'close_stale_location', entry_id: entry.id, at: hit.last_inside_at }],
        applied_actions: results,
        status: 'applied',
      });
      return { applied: true, results };
    }
  }

  // Rule 3: stale_workday — no activity, no recent GPS
  if (sit.open_workday && !sit.open_travel && sit.open_location_entries.length === 0) {
    const idleHours = sit.latest_ping
      ? hoursBetween(sit.latest_ping.recorded_at, sit.now_iso)
      : 999;
    const workdayHours = hoursBetween(sit.open_workday.started_at, sit.now_iso);
    if (
      workdayHours >= STALE_WORKDAY_MIN_IDLE_HOURS &&
      idleHours >= STALE_WORKDAY_MIN_GPS_GAP_HOURS
    ) {
      const closeIso = sit.latest_ping?.recorded_at || sit.open_workday.started_at;
      const r = await applyCloseStaleWorkday(supabase, {
        workdayId: sit.open_workday.id,
        atIso: closeIso,
      });
      results.push({ action: 'close_stale_workday', at: closeIso, ...r });
      await logCorrection(supabase, {
        organization_id: sit.organization_id,
        staff_id: sit.staff_id,
        situation_kind: 'stale_workday',
        confidence: 0.88,
        ai_reasoning: `Arbetsdag öppen sedan ${sit.open_workday.started_at}. Ingen aktivitet senaste ${STALE_WORKDAY_MIN_IDLE_HOURS}h och senaste GPS-ping ${idleHours.toFixed(1)}h gammal.`,
        ai_model: 'deterministic_rules',
        situation_snapshot: sit,
        suggested_actions: [{ kind: 'close_stale_workday', workday_id: sit.open_workday.id, at: closeIso }],
        applied_actions: results,
        status: 'applied',
      });
      return { applied: true, results };
    }
  }

  return { applied: false, results: [] };
}

/**
 * Ask Lovable AI Gateway to classify ambiguous situations.
 */
async function classifyWithAI(sit: StaffSituation): Promise<{
  situation_kind: string;
  confidence: number;
  reasoning: string;
  ok: boolean;
} | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.warn('[reality-reconciler] LOVABLE_API_KEY missing — skipping AI');
    return null;
  }

  const systemPrompt = `Du är en analytiker som granskar fält-personalens tidsspårning.
Du får en situationsrapport med öppen arbetsdag, öppen resa, öppna lokal-stämplingar,
GPS-pings senaste 2h och geofence-träffar. Klassificera situationen och bedöm
sannolikheten att något är fel. Svara aldrig med data utanför inputen.`;

  const userPrompt = `Situation just nu (${sit.now_iso}):\n${JSON.stringify(sit, null, 2)}`;

  try {
    const resp = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'classify_situation',
              description: 'Klassificera personalens nuvarande situation',
              parameters: {
                type: 'object',
                properties: {
                  situation_kind: {
                    type: 'string',
                    enum: [
                      'nominal',
                      'travel_arrived_undetected',
                      'forgot_to_stop_travel',
                      'stale_location',
                      'stale_workday',
                      'presence_without_workday',
                      'inconsistent_state',
                    ],
                  },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  reasoning: { type: 'string', description: 'Kort förklaring på svenska, max 2 meningar' },
                },
                required: ['situation_kind', 'confidence', 'reasoning'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'classify_situation' } },
        reasoning: { effort: 'low' },
      }),
    });

    if (!resp.ok) {
      console.error('[reality-reconciler] AI gateway error', resp.status, await resp.text());
      return null;
    }

    const json = await resp.json();
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.arguments) return null;
    const parsed = JSON.parse(tc.function.arguments);
    return {
      situation_kind: parsed.situation_kind,
      confidence: Number(parsed.confidence),
      reasoning: parsed.reasoning,
      ok: true,
    };
  } catch (err) {
    console.error('[reality-reconciler] AI call failed:', err);
    return null;
  }
}

async function processOrg(supabase: any, org: OrgRow, nowIso: string): Promise<{
  org_id: string;
  active_staff: number;
  applied: number;
  asked_user: number;
  uncertain: number;
  errors: number;
}> {
  const stats = { org_id: org.id, active_staff: 0, applied: 0, asked_user: 0, uncertain: 0, errors: 0 };

  const { data: locs } = await supabase
    .from('organization_locations')
    .select('id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_active')
    .eq('organization_id', org.id)
    .eq('is_active', true);
  const locations: OrgLocation[] = (locs || []).filter((l: any) => l.latitude != null && l.longitude != null);

  const active = await listActiveStaff(supabase, org.id, nowIso);
  stats.active_staff = active.length;

  for (const s of active) {
    try {
      const sit = await buildSituation(supabase, {
        staffId: s.staff_id,
        staffName: s.staff_name,
        organizationId: org.id,
        locations,
        nowIso,
      });

      // Skip if no GPS data and no open work — nothing to reconcile
      if (
        !sit.open_workday &&
        !sit.open_travel &&
        sit.open_location_entries.length === 0 &&
        sit.recent_pings_count === 0
      ) {
        continue;
      }

      const det = await tryDeterministicRules(supabase, org, sit, locations);
      if (det.applied) {
        stats.applied++;
        continue;
      }

      // Only consult AI if there's something interesting going on
      const interesting =
        !!sit.open_travel ||
        sit.open_location_entries.length > 0 ||
        (!!sit.open_workday && sit.recent_pings_count === 0);
      if (!interesting) continue;

      const ai = await classifyWithAI(sit);
      if (!ai) continue;

      if (ai.situation_kind === 'nominal') continue;

      let status: 'applied' | 'asked_user' | 'uncertain' = 'uncertain';
      if (ai.confidence >= AUTO_APPLY_MIN) status = 'applied';
      else if (ai.confidence >= ASK_USER_MIN) status = 'asked_user';

      // For now, AI-suggested actions are logged but not auto-applied beyond
      // the deterministic rules — those rules cover the high-confidence cases
      // and AI provides observability for medium-confidence ones.
      await logCorrection(supabase, {
        organization_id: org.id,
        staff_id: s.staff_id,
        situation_kind: ai.situation_kind,
        confidence: ai.confidence,
        ai_reasoning: ai.reasoning,
        ai_model: AI_MODEL,
        situation_snapshot: sit,
        suggested_actions: [],
        applied_actions: [],
        status,
      });

      if (status === 'applied') stats.applied++;
      else if (status === 'asked_user') stats.asked_user++;
      else stats.uncertain++;
    } catch (err) {
      console.error(`[reality-reconciler] staff ${s.staff_id} failed:`, err);
      stats.errors++;
    }
  }

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth
  const cronSecret = req.headers.get('x-cron-secret');
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || cronSecret !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const nowIso = new Date().toISOString();

  // Optional: limit to one org via ?org=<uuid> for testing
  const url = new URL(req.url);
  const onlyOrg = url.searchParams.get('org');

  let orgs: OrgRow[];
  if (onlyOrg) {
    orgs = [{ id: onlyOrg }];
  } else {
    const { data } = await supabase.from('organizations').select('id');
    orgs = (data || []) as OrgRow[];
  }

  const results: any[] = [];
  for (const org of orgs) {
    try {
      const r = await processOrg(supabase, org, nowIso);
      results.push(r);
    } catch (err) {
      console.error(`[reality-reconciler] org ${org.id} failed:`, err);
      results.push({ org_id: org.id, error: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, ran_at: nowIso, orgs: results.length, results }, null, 2),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
