const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('IMPORT_API_KEY') ?? ''
    const url = new URL(req.url)
    const org = url.searchParams.get('org') || '08186612-9d04-4e86-9bef-3111a377cc53'
    const apiUrl = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${org}&limit=5`

    const res = await fetch(apiUrl, {
      headers: { 'apikey': apiKey, 'x-api-key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    })

    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* */ }

    const bookings = Array.isArray(json) ? json : (json?.data || json?.bookings || [])
    const allProducts = bookings.flatMap((b: any) => b.products || [])
    const withTags = allProducts.filter((p: any) => Array.isArray(p.tags) && p.tags.length > 0).slice(0, 10)
    const sampleProducts = withTags.map((p: any) => ({
      name: p.product_name || p.name,
      tags: p.tags,
      tags_en: p.tags_en,
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
