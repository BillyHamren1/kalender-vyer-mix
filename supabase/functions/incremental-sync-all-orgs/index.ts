// @ts-nocheck
/**
 * incremental-sync-all-orgs — Safety-net poller.
 *
 * Runs every 5 min via cron. For each active organization, kicks off
 * `import-bookings` in incremental mode. This catches changes from the
 * external Booking system whose webhooks were dropped or never sent
 * (e.g. when only the client name or booking_number changed).
 *
 * Webhooks remain the primary path; this is purely a safety net.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    // Pick organizations that have at least one synced booking — those
    // are the ones using the external Booking system.
    const { data: orgs, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name')

    if (orgErr) throw orgErr

    const results: Array<{ org_id: string; name: string; status: string; error?: string; ms?: number }> = []

    for (const org of (orgs || [])) {
      const orgStart = Date.now()
      try {
        // Skip orgs that don't have any bookings synced (avoid hitting external API for nothing)
        const { count } = await supabase
          .from('bookings')
          .select('id', { head: true, count: 'exact' })
          .eq('organization_id', org.id)
          .limit(1)

        if (!count || count === 0) {
          results.push({ org_id: org.id, name: org.name, status: 'skipped_no_bookings' })
          continue
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            syncMode: 'incremental',
            organization_id: org.id,
            quiet: true,
          }),
        })

        const ms = Date.now() - orgStart
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          results.push({ org_id: org.id, name: org.name, status: `http_${res.status}`, error: txt.substring(0, 200), ms })
          console.error(`[incremental-sync-all-orgs] org=${org.id} failed: ${res.status} ${txt.substring(0, 200)}`)
        } else {
          results.push({ org_id: org.id, name: org.name, status: 'ok', ms })
        }
      } catch (err) {
        results.push({ org_id: org.id, name: org.name, status: 'error', error: String(err?.message || err), ms: Date.now() - orgStart })
        console.error(`[incremental-sync-all-orgs] org=${org.id} threw:`, err)
      }
    }

    const duration_ms = Date.now() - startTime
    console.log('[incremental-sync-all-orgs] done', JSON.stringify({ duration_ms, results }))

    return new Response(
      JSON.stringify({ success: true, duration_ms, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[incremental-sync-all-orgs] unhandled error', err)
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
