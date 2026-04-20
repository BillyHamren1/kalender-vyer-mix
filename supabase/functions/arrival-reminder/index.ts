import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Arrival reminder cron — invoked every ~5 min.
 *
 * GENERIC version (PROMPT 7 unification): processes arrivals for ALL three
 * target kinds (location, project, booking) in a single loop. Same prompt
 * schedule, same resolved/covered logic, same push payload regardless of
 * target type.
 *
 * Schedule per arrival:
 *   prompt 0  → at arrival           (count=0 → send, count=1)
 *   prompt 1  → 30 min after arrival
 *   prompt 2  → 60 min after arrival
 * After 3 prompts, stop.
 *
 * State is keyed by (staff_id, target_type, target_id, arrived_at).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Pull every UNRESOLVED arrival across all target kinds. Recent only — no
    // point reminding people about arrivals from days ago.
    const since = new Date(Date.now() - 8 * 3600 * 1000).toISOString()
    const { data: openArrivals, error: arrivalsErr } = await supabase
      .from('arrival_prompt_log')
      .select('id, organization_id, staff_id, target_type, target_id, location_id, arrived_at, prompt_count, last_prompt_at, resolved')
      .eq('resolved', false)
      .gte('arrived_at', since)
      .order('arrived_at', { ascending: false })
      .limit(500)

    if (arrivalsErr) {
      console.error('[arrival-reminder] failed to load arrivals:', arrivalsErr)
      return new Response(JSON.stringify({ error: arrivalsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Legacy fallback: also include open GPS location_time_entries that don't
    // yet have a corresponding arrival_prompt_log row (data backfill in flight).
    const { data: openEntries } = await supabase
      .from('location_time_entries')
      .select('staff_id, location_id, entered_at, organization_id')
      .is('exited_at', null)
      .eq('source', 'gps')
      .gte('entered_at', since)
      .limit(200)

    type Arrival = {
      id?: string
      organization_id: string
      staff_id: string
      target_type: 'location' | 'project' | 'booking'
      target_id: string
      arrived_at: string
      prompt_count: number
    }

    const arrivals: Arrival[] = []
    for (const a of (openArrivals || [])) {
      const targetType = (a.target_type as any) || (a.location_id ? 'location' : null)
      const targetId = (a.target_id as string | null) || (a.location_id as string | null)
      if (!targetType || !targetId) continue
      arrivals.push({
        id: a.id,
        organization_id: a.organization_id,
        staff_id: a.staff_id,
        target_type: targetType,
        target_id: targetId,
        arrived_at: a.arrived_at,
        prompt_count: a.prompt_count ?? 0,
      })
    }
    // Add legacy open GPS entries that don't have a log yet.
    for (const e of (openEntries || [])) {
      const seen = arrivals.some(a =>
        a.staff_id === e.staff_id &&
        a.target_type === 'location' &&
        a.target_id === e.location_id &&
        a.arrived_at === e.entered_at)
      if (seen) continue
      arrivals.push({
        organization_id: e.organization_id,
        staff_id: e.staff_id,
        target_type: 'location',
        target_id: e.location_id,
        arrived_at: e.entered_at,
        prompt_count: 0,
      })
    }

    const now = Date.now()
    let sent = 0
    let skipped = 0

    for (const arrival of arrivals) {
      const arrivedMs = new Date(arrival.arrived_at).getTime()
      const ageMin = (now - arrivedMs) / 60_000

      const arrivedDateStockholm = new Date(arrivedMs).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
      const arrivedHHMM = new Date(arrivedMs).toLocaleTimeString('sv-SE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm', hour12: false,
      })

      // Already-covered check (same rule as get_arrival_state).
      const { data: openReports } = await supabase
        .from('time_reports')
        .select('id')
        .eq('staff_id', arrival.staff_id)
        .is('end_time', null)
        .limit(1)
      const { data: dayReports } = await supabase
        .from('time_reports')
        .select('id, start_time')
        .eq('staff_id', arrival.staff_id)
        .eq('report_date', arrivedDateStockholm)
        .not('start_time', 'is', null)
        .limit(20)
      const coveringReport = (dayReports || []).find((r: any) => {
        const s = String(r.start_time || '').slice(0, 5)
        return s && s <= arrivedHHMM
      })

      if ((openReports && openReports.length > 0) || coveringReport) {
        // Mark resolved if a log row exists.
        if (arrival.id) {
          await supabase
            .from('arrival_prompt_log')
            .update({ resolved: true, resolved_at: new Date().toISOString() })
            .eq('id', arrival.id)
        }
        skipped++
        continue
      }

      const dueAtMin = arrival.prompt_count === 0 ? 0
        : arrival.prompt_count === 1 ? 30
        : arrival.prompt_count === 2 ? 60
        : Infinity
      if (ageMin < dueAtMin || arrival.prompt_count >= 3) {
        skipped++
        continue
      }

      // Resolve label
      let label = 'arbetsplatsen'
      try {
        if (arrival.target_type === 'location') {
          const { data } = await supabase.from('organization_locations').select('name').eq('id', arrival.target_id).maybeSingle()
          label = data?.name || label
        } else if (arrival.target_type === 'project') {
          const { data } = await supabase.from('large_projects').select('name').eq('id', arrival.target_id).maybeSingle()
          label = data?.name || label
        } else {
          const { data } = await supabase.from('bookings').select('client').eq('id', arrival.target_id).maybeSingle()
          label = data?.client || label
        }
      } catch {}

      const arrivalTimeLabel = new Date(arrivedMs).toLocaleTimeString('sv-SE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
      })
      const title = arrival.prompt_count === 0 ? 'Starta dagen?' : 'Påminnelse: starta timern'
      const body = arrival.prompt_count === 0
        ? `Du verkar ha anlänt till ${label}. Vill du starta dagen?`
        : `Du har varit på ${label} sedan ${arrivalTimeLabel}. Starta dagen då eller nu?`

      try {
        const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`
        const pushRes = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            staff_ids: [arrival.staff_id],
            organization_id: arrival.organization_id,
            title,
            body,
            notification_type: 'schedule',
            data: {
              kind: 'arrival_prompt',
              target_type: arrival.target_type,
              target_id: arrival.target_id,
              arrived_at: arrival.arrived_at,
              // legacy mirror for older app builds
              location_id: arrival.target_type === 'location' ? arrival.target_id : null,
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

      // Update or create the log row.
      if (arrival.id) {
        await supabase
          .from('arrival_prompt_log')
          .update({
            prompt_count: arrival.prompt_count + 1,
            last_prompt_at: new Date().toISOString(),
          })
          .eq('id', arrival.id)
      } else {
        await supabase
          .from('arrival_prompt_log')
          .insert({
            organization_id: arrival.organization_id,
            staff_id: arrival.staff_id,
            target_type: arrival.target_type,
            target_id: arrival.target_id,
            location_id: arrival.target_type === 'location' ? arrival.target_id : null,
            arrived_at: arrival.arrived_at,
            prompt_count: 1,
            last_prompt_at: new Date().toISOString(),
          })
      }
      sent++
    }

    return new Response(JSON.stringify({ success: true, sent, skipped, total: arrivals.length }), {
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
