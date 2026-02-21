import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Validate API key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!webhookSecret || apiKey !== webhookSecret) {
      console.error('receive-booking: Invalid or missing API key')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { booking_id, event_type, organization_id } = body

    console.log(`receive-booking: Incoming webhook - booking_id=${booking_id}, event_type=${event_type || 'unknown'}, organization_id=${organization_id || 'NOT PROVIDED'}`)

    if (!organization_id) {
      console.warn('receive-booking: DEPRECATION WARNING: organization_id not provided. Hub must send organization_id explicitly.')
    }

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: booking_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call import-bookings internally, forwarding organization_id
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const importPayload: Record<string, any> = { booking_id, syncMode: 'single' }
    if (organization_id) importPayload.organization_id = organization_id

    const importResponse = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(importPayload),
    })

    const importResult = await importResponse.json()

    if (!importResponse.ok) {
      console.error(`receive-booking: import-bookings failed with status ${importResponse.status}`, importResult)
      return new Response(
        JSON.stringify({ error: 'Sync failed', details: importResult }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`receive-booking: Sync completed for booking ${booking_id}`, importResult)

    return new Response(
      JSON.stringify({ success: true, booking_id, event_type: event_type || 'unknown', sync_result: importResult }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('receive-booking: Unexpected error', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
