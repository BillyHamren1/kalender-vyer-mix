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

    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* */ }

    const bookings = Array.isArray(json) ? json : (json?.data || json?.bookings || [])
    const sampleProducts = (bookings[0]?.products || bookings[0]?.booking_products || []).slice(0, 5).map((p: any) => ({
      name: p.name,
      keys: Object.keys(p),
      tags: p.tags ?? p.labels ?? p.categories ?? p.tag ?? null,
    }))

    return new Response(JSON.stringify({
      status: res.status,
      api_key_present: apiKey.length > 0,
      api_key_len: apiKey.length,
      top_level_keys: json ? Object.keys(json) : null,
      bookings_count: bookings.length,
      sample_products: sampleProducts,
      raw_preview: text.slice(0, 2000),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
