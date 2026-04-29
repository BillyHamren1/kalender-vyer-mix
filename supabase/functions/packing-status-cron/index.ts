// Periodic job: flippa packing_projects.status från `delivered` (I produktion)
// → `back` (Tillbaka) så fort kopplad bookings.rigdowndate är passerat.
// Multi-tenant safe: filtrerar per organization_id rad-för-rad.
//
// Triggas via pg_cron (se schemaläggning i README/migration).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date().toISOString().slice(0, 10)

    // Hämta alla packings i status `delivered` med booking_id
    const { data: candidates, error } = await supabase
      .from('packing_projects')
      .select('id, organization_id, booking_id')
      .eq('status', 'delivered')
      .not('booking_id', 'is', null)
      .limit(1000)

    if (error) throw error

    // Hämta rigdowndate för alla relevanta bookings i ett svep
    const bookingIds = [...new Set((candidates || []).map((c: any) => c.booking_id).filter(Boolean))]
    const downByBooking = new Map<string, string | null>()
    if (bookingIds.length > 0) {
      const { data: bks } = await supabase
        .from('bookings')
        .select('id, rigdowndate')
        .in('id', bookingIds)
      for (const b of bks || []) downByBooking.set((b as any).id, (b as any).rigdowndate)
    }

    let flipped = 0
    const flippedIds: string[] = []
    for (const row of candidates || []) {
      const downDate = downByBooking.get((row as any).booking_id) ?? null
      if (!downDate) continue
      if (downDate <= today) {
        const { error: upErr } = await supabase
          .from('packing_projects')
          .update({ status: 'back', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('organization_id', row.organization_id)
          .eq('status', 'delivered') // race-safe
        if (!upErr) {
          flipped += 1
          flippedIds.push(row.id)
        }
      }
    }

    console.log(`[packing-status-cron] flipped delivered→back for ${flipped} packing(s):`, flippedIds)

    return new Response(
      JSON.stringify({ ok: true, flipped, ids: flippedIds, today }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[packing-status-cron] error', e)
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
