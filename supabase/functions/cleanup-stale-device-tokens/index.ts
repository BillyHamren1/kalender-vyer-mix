// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Nightly cleanup of stale FCM/APNs device tokens.
 *
 * A token is considered stale if `last_refreshed_at` is older than 30 days.
 * The mobile app re-registers on every cold start AND on app-resume when
 * its local "last register" timestamp is >24h old, so any active user will
 * have a fresh token long before the 30-day window elapses.
 *
 * Tokens that are NOT refreshed within 30 days belong to:
 *   - users who have stopped using the app
 *   - tokens that FCM has silently rotated (the new token already arrived
 *     via the registration event and was upserted, but the old row lingered)
 *
 * Both cases are safe to delete: if the user comes back, the app will
 * register a fresh token at next launch.
 *
 * Trigger: pg_cron nightly + manual GET/POST for ad-hoc admin runs.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Snapshot which rows we are about to remove so the log is useful.
    const { data: doomed, error: selectErr } = await supabase
      .from('device_tokens')
      .select('id, staff_id, platform, last_refreshed_at')
      .lt('last_refreshed_at', cutoffIso)

    if (selectErr) {
      console.error('[cleanup-stale-device-tokens] select failed:', selectErr)
      return new Response(
        JSON.stringify({ error: selectErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const toDelete = doomed ?? []
    console.log(`[cleanup-stale-device-tokens] cutoff=${cutoffIso} candidates=${toDelete.length}`)

    if (toDelete.length === 0) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0, cutoff: cutoffIso }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    for (const row of toDelete) {
      const ageDays = Math.round(
        (Date.now() - new Date(row.last_refreshed_at).getTime()) / (24 * 60 * 60 * 1000)
      )
      console.log(
        `[cleanup-stale-device-tokens] purge staff=${row.staff_id} platform=${row.platform} age_days=${ageDays}`
      )
    }

    const { error: deleteErr } = await supabase
      .from('device_tokens')
      .delete()
      .lt('last_refreshed_at', cutoffIso)

    if (deleteErr) {
      console.error('[cleanup-stale-device-tokens] delete failed:', deleteErr)
      return new Response(
        JSON.stringify({ error: deleteErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, deleted: toDelete.length, cutoff: cutoffIso }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[cleanup-stale-device-tokens] unhandled:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
