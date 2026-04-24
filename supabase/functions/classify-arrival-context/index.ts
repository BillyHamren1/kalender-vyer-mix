// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

/**
 * classify-arrival-context
 * ------------------------
 * Hybrid classifier for "what is this place + why did the user stop here?"
 * Called by the mobile app right after a travel log is auto-stopped at a
 * destination that did NOT match a planned booking the user is assigned to.
 *
 * Order (cheapest → most expensive):
 *   1. Local bookings ±14 days within 300 m where user is NOT assigned
 *      → kind='unplanned_job_candidate'
 *   2. organization_locations within 300 m → kind='unknown' (suppress; the
 *      regular arrival prompt owns these places)
 *   3. Mapbox POI category at the coords → kind='meal_break' or 'supply_store'
 *   4. AI fallback (google/gemini-3-flash-preview) only when (3) is unclear
 *
 * Returns { kind, confidence, payload, suppressed_by_recent_decision }.
 * Persists a row in arrival_context_suggestions with decision=null.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SEARCH_RADIUS_M = 300
const PLANNED_JOB_WINDOW_DAYS_BACK = 14
const PLANNED_JOB_WINDOW_DAYS_FWD = 14
const MEAL_WINDOW_START_MIN = 11 * 60
const MEAL_WINDOW_END_MIN = 13 * 60 + 30

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface ClassifyInput {
  staff_id: string
  organization_id: string
  travel_log_id?: string | null
  lat: number
  lng: number
  /** ISO timestamp of the arrival (defaults to now). */
  arrived_at?: string
  /** Pre-fetched destination address (optional, used for AI context). */
  to_address?: string | null
}

type Kind = 'unplanned_job_candidate' | 'meal_break' | 'supply_store' | 'unknown'

interface ClassifyResult {
  kind: Kind
  confidence: number
  payload: Record<string, unknown>
  suggestion_id: string | null
  suppressed_reason?: string
}

// --- Mapbox POI categories ---------------------------------------------------
const MEAL_CATEGORIES = new Set([
  'restaurant',
  'cafe',
  'coffee',
  'fast food',
  'fast_food',
  'food',
  'food and drink',
])
const SUPPLY_CATEGORIES = new Set([
  'hardware store',
  'home improvement',
  'building supplies',
  'furniture store',
  'electronics store',
])
// Fallback: catch common Swedish supply-store names even if Mapbox category is generic
const SUPPLY_NAME_PATTERNS = [
  /bauhaus/i,
  /k-?rauta/i,
  /byggmax/i,
  /optimera/i,
  /clas\s*ohlson/i,
  /jula/i,
  /biltema/i,
  /ikea/i,
  /xl[-\s]?bygg/i,
  /beijer/i,
  /hornbach/i,
]

interface MapboxPoi {
  name: string | null
  categories: string[]
  address: string | null
}

async function fetchMapboxPoi(lat: number, lng: number, token: string): Promise<MapboxPoi | null> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=poi&language=sv&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const f = data?.features?.[0]
    if (!f) return null
    const cats: string[] = (f.properties?.category || '')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean)
    return {
      name: f.text || f.place_name || null,
      categories: cats,
      address: f.place_name || null,
    }
  } catch (err) {
    console.warn('[classify-arrival-context] mapbox fetch failed:', err)
    return null
  }
}

function categorizePoi(poi: MapboxPoi | null, arrivedAt: Date): { kind: Kind; confidence: number } {
  if (!poi) return { kind: 'unknown', confidence: 0 }
  const cats = poi.categories
  const name = poi.name || ''

  // Meal break — only inside lunch window
  const minOfDay = arrivedAt.getHours() * 60 + arrivedAt.getMinutes()
  const inMealWindow = minOfDay >= MEAL_WINDOW_START_MIN && minOfDay <= MEAL_WINDOW_END_MIN
  if (cats.some((c) => MEAL_CATEGORIES.has(c)) && inMealWindow) {
    return { kind: 'meal_break', confidence: 0.85 }
  }

  // Supply store — by Mapbox category OR by well-known name
  if (cats.some((c) => SUPPLY_CATEGORIES.has(c))) {
    return { kind: 'supply_store', confidence: 0.9 }
  }
  if (SUPPLY_NAME_PATTERNS.some((p) => p.test(name))) {
    return { kind: 'supply_store', confidence: 0.8 }
  }

  return { kind: 'unknown', confidence: 0 }
}

// --- AI fallback -------------------------------------------------------------
async function aiClassify(
  poi: MapboxPoi | null,
  toAddress: string | null,
  arrivedAt: Date,
): Promise<{ kind: Kind; confidence: number } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) return null

  const minOfDay = arrivedAt.getHours() * 60 + arrivedAt.getMinutes()
  const inMealWindow = minOfDay >= MEAL_WINDOW_START_MIN && minOfDay <= MEAL_WINDOW_END_MIN

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content:
              'You classify why a field-worker may have stopped at a place. Reply ONLY via the tool. Never invent categories beyond meal_break, supply_store, unknown.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              place_name: poi?.name,
              mapbox_categories: poi?.categories,
              address: toAddress || poi?.address,
              local_time: arrivedAt.toISOString(),
              is_lunch_window: inMealWindow,
            }),
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'classify_place',
              description: 'Classify the most likely reason for stopping at this place.',
              parameters: {
                type: 'object',
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['meal_break', 'supply_store', 'unknown'],
                  },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['kind', 'confidence'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'classify_place' } },
      }),
    })
    if (!res.ok) {
      console.warn('[classify-arrival-context] AI gateway non-ok:', res.status)
      return null
    }
    const data = await res.json()
    const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    if (!argsStr) return null
    const parsed = JSON.parse(argsStr)
    if (!['meal_break', 'supply_store', 'unknown'].includes(parsed.kind)) return null
    return { kind: parsed.kind as Kind, confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)) }
  } catch (err) {
    console.warn('[classify-arrival-context] AI fallback failed:', err)
    return null
  }
}

// --- Local data lookups ------------------------------------------------------
async function findNearbyPlannedBooking(
  supabase: any,
  organizationId: string,
  staffId: string,
  lat: number,
  lng: number,
): Promise<any | null> {
  const today = new Date()
  const back = new Date(today)
  back.setDate(back.getDate() - PLANNED_JOB_WINDOW_DAYS_BACK)
  const fwd = new Date(today)
  fwd.setDate(fwd.getDate() + PLANNED_JOB_WINDOW_DAYS_FWD)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  // Bounding box (rough): ±0.005° ≈ ±550 m, plenty of headroom for haversine filter
  const dLat = 0.005
  const dLng = 0.005 / Math.cos((lat * Math.PI) / 180)

  const { data: candidates, error } = await supabase
    .from('bookings')
    .select('id, client, eventdate, rigdaydate, delivery_latitude, delivery_longitude, deliveryaddress')
    .eq('organization_id', organizationId)
    .gte('eventdate', fmt(back))
    .lte('eventdate', fmt(fwd))
    .not('delivery_latitude', 'is', null)
    .not('delivery_longitude', 'is', null)
    .gte('delivery_latitude', lat - dLat)
    .lte('delivery_latitude', lat + dLat)
    .gte('delivery_longitude', lng - dLng)
    .lte('delivery_longitude', lng + dLng)
    .limit(20)

  if (error) {
    console.warn('[classify-arrival-context] bookings lookup error:', error)
    return null
  }
  if (!candidates || candidates.length === 0) return null

  // Filter to <= SEARCH_RADIUS_M and check assignment.
  const within = candidates.filter(
    (b: any) =>
      b.delivery_latitude != null &&
      b.delivery_longitude != null &&
      haversineMeters(lat, lng, Number(b.delivery_latitude), Number(b.delivery_longitude)) <=
        SEARCH_RADIUS_M,
  )
  if (within.length === 0) return null

  // Closest first
  within.sort(
    (a: any, b: any) =>
      haversineMeters(lat, lng, Number(a.delivery_latitude), Number(a.delivery_longitude)) -
      haversineMeters(lat, lng, Number(b.delivery_latitude), Number(b.delivery_longitude)),
  )

  // Skip if user is assigned to any of these.
  const ids = within.map((b: any) => b.id)
  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id')
    .eq('staff_id', staffId)
    .in('booking_id', ids)
  const assignedIds = new Set((assignments || []).map((r: any) => r.booking_id))
  const unassigned = within.find((b: any) => !assignedIds.has(b.id))
  return unassigned || null
}

async function isFixedLocationNearby(
  supabase: any,
  organizationId: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  const dLat = 0.005
  const dLng = 0.005 / Math.cos((lat * Math.PI) / 180)
  const { data } = await supabase
    .from('organization_locations')
    .select('latitude, longitude')
    .eq('organization_id', organizationId)
    .not('latitude', 'is', null)
    .gte('latitude', lat - dLat)
    .lte('latitude', lat + dLat)
    .gte('longitude', lng - dLng)
    .lte('longitude', lng + dLng)
    .limit(20)
  if (!data) return false
  return data.some(
    (l: any) =>
      haversineMeters(lat, lng, Number(l.latitude), Number(l.longitude)) <= SEARCH_RADIUS_M,
  )
}

/**
 * If the staff has already accepted/rejected a suggestion at ~this place
 * earlier today, suppress (don't re-prompt). "Same place" = within 100 m.
 */
async function recentDecidedSuggestion(
  supabase: any,
  staffId: string,
  lat: number,
  lng: number,
): Promise<any | null> {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('arrival_context_suggestions')
    .select('id, lat, lng, decision, decided_at')
    .eq('staff_id', staffId)
    .gte('created_at', since.toISOString())
    .not('decision', 'is', null)
    .limit(50)
  if (!data) return null
  return (
    data.find(
      (r: any) => haversineMeters(lat, lng, Number(r.lat), Number(r.lng)) <= 100,
    ) || null
  )
}

// --- Core classifier ---------------------------------------------------------
export async function classifyArrival(
  supabase: any,
  mapboxToken: string | null,
  input: ClassifyInput,
): Promise<ClassifyResult> {
  const arrivedAt = input.arrived_at ? new Date(input.arrived_at) : new Date()

  // 0. Suppress if same place + same day already decided
  const prior = await recentDecidedSuggestion(supabase, input.staff_id, input.lat, input.lng)
  if (prior) {
    return {
      kind: 'unknown',
      confidence: 0,
      payload: { suppressed_reason: 'already_decided_today', prior_id: prior.id },
      suggestion_id: null,
      suppressed_reason: 'already_decided_today',
    }
  }

  // 1. Nearby planned booking (user NOT assigned) → A
  const planned = await findNearbyPlannedBooking(
    supabase,
    input.organization_id,
    input.staff_id,
    input.lat,
    input.lng,
  )
  if (planned) {
    const result: ClassifyResult = {
      kind: 'unplanned_job_candidate',
      confidence: 0.95,
      payload: {
        booking_id: planned.id,
        client: planned.client,
        eventdate: planned.eventdate,
        rigdaydate: planned.rigdaydate,
        address: planned.deliveryaddress,
      },
      suggestion_id: null,
    }
    return await persist(supabase, input, result)
  }

  // 2. Fixed location → suppress
  const isFixed = await isFixedLocationNearby(supabase, input.organization_id, input.lat, input.lng)
  if (isFixed) {
    return {
      kind: 'unknown',
      confidence: 0,
      payload: { suppressed_reason: 'fixed_location' },
      suggestion_id: null,
      suppressed_reason: 'fixed_location',
    }
  }

  // 3. Mapbox POI → B/C
  let poi: MapboxPoi | null = null
  if (mapboxToken) poi = await fetchMapboxPoi(input.lat, input.lng, mapboxToken)
  const ruleHit = categorizePoi(poi, arrivedAt)

  if (ruleHit.kind !== 'unknown' && ruleHit.confidence >= 0.5) {
    const result: ClassifyResult = {
      kind: ruleHit.kind,
      confidence: ruleHit.confidence,
      payload: {
        place_name: poi?.name,
        address: input.to_address || poi?.address,
        mapbox_categories: poi?.categories || [],
      },
      suggestion_id: null,
    }
    return await persist(supabase, input, result)
  }

  // 4. AI fallback only when rules said unknown
  const ai = await aiClassify(poi, input.to_address || null, arrivedAt)
  if (ai && ai.kind !== 'unknown' && ai.confidence >= 0.5) {
    const result: ClassifyResult = {
      kind: ai.kind,
      confidence: ai.confidence,
      payload: {
        place_name: poi?.name,
        address: input.to_address || poi?.address,
        mapbox_categories: poi?.categories || [],
        ai_used: true,
      },
      suggestion_id: null,
    }
    return await persist(supabase, input, result)
  }

  // Final fallback: unknown — no prompt
  return {
    kind: 'unknown',
    confidence: 0,
    payload: { place_name: poi?.name, address: input.to_address || poi?.address },
    suggestion_id: null,
  }
}

async function persist(
  supabase: any,
  input: ClassifyInput,
  result: ClassifyResult,
): Promise<ClassifyResult> {
  try {
    const { data, error } = await supabase
      .from('arrival_context_suggestions')
      .insert({
        staff_id: input.staff_id,
        organization_id: input.organization_id,
        travel_log_id: input.travel_log_id || null,
        lat: input.lat,
        lng: input.lng,
        kind: result.kind,
        confidence: result.confidence,
        payload: result.payload,
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[classify-arrival-context] persist failed:', error)
      return result
    }
    return { ...result, suggestion_id: data?.id || null }
  } catch (err) {
    console.warn('[classify-arrival-context] persist threw:', err)
    return result
  }
}

// --- HTTP entry --------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json().catch(() => ({}))
    const {
      staff_id,
      organization_id,
      travel_log_id,
      lat,
      lng,
      arrived_at,
      to_address,
    } = body || {}

    if (!staff_id || !organization_id || typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(
        JSON.stringify({ error: 'staff_id, organization_id, lat, lng are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get mapbox token from edge env (same source as mapbox-token function)
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || Deno.env.get('MAPBOX_TOKEN') || null

    const result = await classifyArrival(supabase, mapboxToken, {
      staff_id,
      organization_id,
      travel_log_id,
      lat,
      lng,
      arrived_at,
      to_address,
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[classify-arrival-context] unhandled:', err)
    return new Response(
      JSON.stringify({ kind: 'unknown', confidence: 0, payload: {}, suggestion_id: null, error: 'internal' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
