import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Arrival reminder cron — invoked every ~5 min.
 *
 * For each open location_time_entries row (staff inside a geofence) where the
 * staff has NO active time_report (end_time IS NULL), send a push notification
 * "Du verkar ha ankommit, starta dagen?" according to schedule:
 *   prompt 0  → at arrival (count=0 → send, count=1)
 *   prompt 1  → 30 min after arrival
 *   prompt 2  → 60 min after arrival
 * After 3 prompts, stop.
 *
 * State is tracked in arrival_prompt_log keyed by (staff_id, location_id, arrived_at).
 * When the staff starts a timer (end_of_day flow updates the open report), the
 * mobile app calls 'mark_arrival_resolved' to flip resolved=true.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Find all open geofence entries
    const { data: openEntries, error: entriesErr } = await supabase
      .from('location_time_entries')
      .select('staff_id, location_id, entered_at, organization_id, organization_locations(name)')
      .is('exited_at', null)
      .order('entered_at', { ascending: false })

    if (entriesErr) {
      console.error('[arrival-reminder] failed to load entries:', entriesErr)
      return new Response(JSON.stringify({ error: entriesErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = Date.now()
    let sent = 0
    let skipped = 0

    for (const entry of (openEntries || [])) {
      const arrivedMs = new Date(entry.entered_at).getTime()
      const ageMin = (now - arrivedMs) / 60_000

      // Stockholm-local date for the arrival (cross-midnight safe)
      const arrivedDateStockholm = new Date(arrivedMs).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
      const arrivedHHMM = new Date(arrivedMs).toLocaleTimeString('sv-SE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm', hour12: false,
      })

      // Resolved if there is an OPEN time_report, or a CLOSED one that already
      // covers this arrival (start_time <= arrival HH:mm on the same Stockholm date).
      const { data: openReports } = await supabase
        .from('time_reports')
        .select('id')
        .eq('staff_id', entry.staff_id)
        .is('end_time', null)
        .limit(1)
      const { data: dayReports } = await supabase
        .from('time_reports')
        .select('id, start_time')
        .eq('staff_id', entry.staff_id)
        .eq('report_date', arrivedDateStockholm)
        .not('start_time', 'is', null)
        .limit(20)
      const coveringReport = (dayReports || []).find((r: any) => {
        const s = String(r.start_time || '').slice(0, 5)
        return s && s <= arrivedHHMM
      })

      if ((openReports && openReports.length > 0) || coveringReport) {
        // User already started/has a timer today → mark log resolved if exists, skip prompt.
        await supabase
          .from('arrival_prompt_log')
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq('staff_id', entry.staff_id)
          .eq('location_id', entry.location_id)
          .eq('arrived_at', entry.entered_at)
          .eq('resolved', false)
        skipped++
        continue
      }

      // Look up or create prompt log row
      const { data: log } = await supabase
        .from('arrival_prompt_log')
        .select('id, prompt_count, last_prompt_at, resolved')
        .eq('staff_id', entry.staff_id)
        .eq('location_id', entry.location_id)
        .eq('arrived_at', entry.entered_at)
        .maybeSingle()

      if (log?.resolved) {
        skipped++
        continue
      }

      const promptCount = log?.prompt_count ?? 0
      // Schedule: prompt #1 at 0min, #2 at 30min, #3 at 60min
      const dueAtMin = promptCount === 0 ? 0 : promptCount === 1 ? 30 : promptCount === 2 ? 60 : Infinity
      if (ageMin < dueAtMin || promptCount >= 3) {
        skipped++
        continue
      }

      // Send push
      const locationName = (entry as any).organization_locations?.name || 'arbetsplatsen'
      const arrivalTimeLabel = new Date(arrivedMs).toLocaleTimeString('sv-SE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
      })
      const title = promptCount === 0 ? 'Starta dagen?' : 'Påminnelse: starta timern'
      const body = promptCount === 0
        ? `Du verkar ha anlänt till ${locationName}. Vill du starta dagen?`
        : `Du har varit på ${locationName} sedan ${arrivalTimeLabel}. Starta dagen då eller nu?`

      try {
        const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`
        const pushRes = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            staff_ids: [entry.staff_id],
            organization_id: entry.organization_id,
            title,
            body,
            notification_type: 'schedule',
            data: {
              kind: 'arrival_prompt',
              location_id: entry.location_id,
              arrived_at: entry.entered_at,
            },
          }),
        })
        if (!pushRes.ok) {
          const errText = await pushRes.text()
          console.warn(`[arrival-reminder] push failed: ${errText}`)
        }
      } catch (pushErr) {
        console.warn('[arrival-reminder] push error:', pushErr)
      }

      // Upsert log row
      if (log) {
        await supabase
          .from('arrival_prompt_log')
          .update({
            prompt_count: promptCount + 1,
            last_prompt_at: new Date().toISOString(),
          })
          .eq('id', log.id)
      } else {
        await supabase
          .from('arrival_prompt_log')
          .insert({
            organization_id: entry.organization_id,
            staff_id: entry.staff_id,
            location_id: entry.location_id,
            arrived_at: entry.entered_at,
            prompt_count: 1,
            last_prompt_at: new Date().toISOString(),
          })
      }
      sent++
    }

    return new Response(JSON.stringify({ success: true, sent, skipped, total: openEntries?.length || 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[arrival-reminder] fatal:', err)
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
