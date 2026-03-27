/**
 * receive-booking — Clean intake layer for Planning system.
 *
 * Responsibilities (and ONLY these):
 *   1. Validate API key
 *   2. Validate required fields (booking_id, organization_id)
 *   3. Validate event_type / payload shape
 *   4. Forward to import-bookings
 *   5. Return clear success/failure response
 *
 * This function MUST NOT contain any Planning business logic:
 *   - No calendar event creation/deletion
 *   - No booking status updates
 *   - No project/job/packing mutations
 *   - No warehouse event management
 *
 * All business logic lives in import-bookings (single source of truth).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const VALID_EVENT_TYPES = [
  'booking.confirmed',
  'booking.updated',
  'booking.cancelled',
  'booking.offer',
  'booking.created',
] as const

interface IntakeLog {
  booking_id: string | null
  organization_id: string | null
  event_type: string | null
  received_at: string
  forwarded_at: string | null
  outcome: 'accepted' | 'rejected' | 'error'
  rejection_reason: string | null
  duration_ms: number | null
}

function buildLog(partial: Partial<IntakeLog>): IntakeLog {
  return {
    booking_id: null,
    organization_id: null,
    event_type: null,
    received_at: new Date().toISOString(),
    forwarded_at: null,
    outcome: 'rejected',
    rejection_reason: null,
    duration_ms: null,
    ...partial,
  }
}

serve(async (req) => {
  const startTime = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    const log = buildLog({ outcome: 'rejected', rejection_reason: 'method_not_allowed' })
    console.error('[receive-booking]', JSON.stringify(log))
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // ── 1. Validate API key ──────────────────────────────────────────────
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!webhookSecret || apiKey !== webhookSecret) {
      const log = buildLog({ outcome: 'rejected', rejection_reason: 'unauthorized', duration_ms: Date.now() - startTime })
      console.error('[receive-booking]', JSON.stringify(log))
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Parse and validate payload ────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      const log = buildLog({ outcome: 'rejected', rejection_reason: 'invalid_json', duration_ms: Date.now() - startTime })
      console.error('[receive-booking]', JSON.stringify(log))
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { booking_id, event_type, organization_id } = body as {
      booking_id?: string
      event_type?: string
      organization_id?: string
    }

    // ── 3. Validate required fields ──────────────────────────────────────
    if (!organization_id) {
      const log = buildLog({ booking_id: booking_id ?? null, event_type: event_type ?? null, outcome: 'rejected', rejection_reason: 'missing_organization_id', duration_ms: Date.now() - startTime })
      console.error('[receive-booking]', JSON.stringify(log))
      return new Response(
        JSON.stringify({ error: 'Missing required field: organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!booking_id) {
      const log = buildLog({ organization_id, event_type: event_type ?? null, outcome: 'rejected', rejection_reason: 'missing_booking_id', duration_ms: Date.now() - startTime })
      console.error('[receive-booking]', JSON.stringify(log))
      return new Response(
        JSON.stringify({ error: 'Missing required field: booking_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Validate event_type (warn but don't reject unknown types) ────
    if (event_type && !VALID_EVENT_TYPES.includes(event_type as any)) {
      console.warn(`[receive-booking] Unknown event_type="${event_type}" for booking=${booking_id} — forwarding anyway`)
    }

    // ── 5. Forward to import-bookings ────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const importPayload = {
      booking_id,
      organization_id,
      event_type: event_type || 'unknown',
      syncMode: 'single',
    }

    const forwardedAt = new Date().toISOString()

    // Fire-and-forget to prevent external webhook timeout (~16s limit).
    // If the edge runtime terminates early, the periodic background sync will catch it.
    fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(importPayload),
    }).then(async (res) => {
      const importLog = {
        booking_id,
        organization_id,
        event_type: event_type || 'unknown',
        import_status: res.status,
        import_ok: res.ok,
      }
      if (!res.ok) {
        const body = await res.text().catch(() => 'no body')
        console.error(`[receive-booking] import-bookings failed`, JSON.stringify({ ...importLog, error: body.substring(0, 500) }))
      } else {
        console.log(`[receive-booking] import-bookings succeeded`, JSON.stringify(importLog))
      }
    }).catch(err => {
      console.error(`[receive-booking] import-bookings fetch error`, JSON.stringify({
        booking_id,
        organization_id,
        event_type: event_type || 'unknown',
        error: err.message,
      }))
    })

    // ── 6. Respond immediately with 202 ──────────────────────────────────
    const log = buildLog({
      booking_id,
      organization_id,
      event_type: event_type ?? null,
      forwarded_at: forwardedAt,
      outcome: 'accepted',
      duration_ms: Date.now() - startTime,
    })
    console.log('[receive-booking]', JSON.stringify(log))

    return new Response(
      JSON.stringify({
        success: true,
        accepted: true,
        booking_id,
        event_type: event_type || 'unknown',
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const log = buildLog({
      outcome: 'error',
      rejection_reason: error.message,
      duration_ms: Date.now() - startTime,
    })
    console.error('[receive-booking]', JSON.stringify(log))
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
