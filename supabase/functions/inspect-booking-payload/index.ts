// Check tags presence across many bookings/products without dumping everything.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const TOKEN = 'tags-bootstrap-2026-05-02-d42a96b9'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (auth !== TOKEN) return new Response('unauthorized', { status: 401, headers: corsHeaders })

  const importApiKey = Deno.env.get('IMPORT_API_KEY') ?? ''
  let body: { organization_id?: string; pages?: number } = {}
  try { body = await req.json() } catch {}
  const orgId = body.organization_id || 'f5e5cade-f08b-4833-a105-56461f15b191'
  const maxPages = body.pages ?? 5

  const stats = {
    bookings: 0,
    products: 0,
    products_with_tags: 0,
    products_with_tags_en: 0,
    distinct_tags: new Set<string>(),
    distinct_tags_en: new Set<string>(),
    sample_tagged_products: [] as any[],
  }

  for (let page = 0; page < maxPages; page++) {
    const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${orgId}&limit=100&offset=${page * 100}`
    const res = await fetch(url, { headers: {
      apikey: importApiKey, 'x-api-key': importApiKey, Authorization: `Bearer ${importApiKey}`,
    } })
    if (!res.ok) break
    const json = await res.json()
    const bookings = json?.data ?? []
    if (bookings.length === 0) break
    for (const b of bookings) {
      stats.bookings++
      for (const p of b.products ?? []) {
        stats.products++
        const t = Array.isArray(p.tags) ? p.tags : []
        const te = Array.isArray(p.tags_en) ? p.tags_en : []
        if (t.length > 0) {
          stats.products_with_tags++
          for (const x of t) stats.distinct_tags.add(String(x))
          if (stats.sample_tagged_products.length < 5) {
            stats.sample_tagged_products.push({ name: p.product_name, tags: t, tags_en: te })
          }
        }
        if (te.length > 0) {
          stats.products_with_tags_en++
          for (const x of te) stats.distinct_tags_en.add(String(x))
        }
      }
    }
    if (bookings.length < 100) break
  }

  return new Response(JSON.stringify({
    bookings: stats.bookings,
    products: stats.products,
    products_with_tags: stats.products_with_tags,
    products_with_tags_en: stats.products_with_tags_en,
    distinct_tags: [...stats.distinct_tags],
    distinct_tags_en: [...stats.distinct_tags_en],
    sample_tagged_products: stats.sample_tagged_products,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
