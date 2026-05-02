// Temporary debug function: fetch a single booking from Booking API and return product keys + sample tag value
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('IMPORT_API_KEY') ?? ''
    const apiUrl = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?limit=3`

    const res = await fetch(apiUrl, {
      headers: { 'apikey': apiKey, 'x-api-key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    })

    const json = await res.json()
    const bookings = Array.isArray(json) ? json : (json.data || json.bookings || [])
    return new Response(JSON.stringify({ status: res.status, top_level_keys: Object.keys(json || {}), bookings_count: bookings.length, raw_first_booking: bookings[0] ?? null, raw_root_sample: JSON.stringify(json).slice(0, 1500) }, null, 2), {
      const products = b.products || b.booking_products || []
      const firstProductsWithTags = products.slice(0, 5).map((p: any) => ({
        name: p.name,
        keys: Object.keys(p),
        tags: p.tags ?? p.labels ?? p.categories ?? p.tag ?? null,
      }))
      return {
        booking_id: b.id ?? b.booking_id,
        product_count: products.length,
        sample_products: firstProductsWithTags,
      }
    })

    return new Response(JSON.stringify({ summary, raw_first: bookings[0] ?? null }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
