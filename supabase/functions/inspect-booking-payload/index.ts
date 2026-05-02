// Temporary debug: dump raw external booking payload to find where tags live.
// Auth: bootstrap token only. Remove after investigation.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN = 'tags-bootstrap-2026-05-02-d42a96b9'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (auth !== TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const importApiKey = Deno.env.get('IMPORT_API_KEY') ?? ''
  let body: { organization_id?: string; booking_id?: string; offset?: number } = {}
  try { body = await req.json() } catch { /* noop */ }

  const orgId = body.organization_id || 'f5e5cade-f08b-4833-a105-56461f15b191'
  const offset = body.offset ?? 0

  const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${orgId}&limit=1&offset=${offset}`
  const res = await fetch(url, {
    headers: {
      apikey: importApiKey,
      'x-api-key': importApiKey,
      Authorization: `Bearer ${importApiKey}`,
    },
  })

  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* return raw */ }

  // Pull out the first booking and analyze keys
  const booking = json?.data?.[0] ?? null
  const product = booking?.products?.[0] ?? null

  const analysis = {
    http_status: res.status,
    booking_id: booking?.id,
    booking_top_keys: booking ? Object.keys(booking).sort() : [],
    products_count: Array.isArray(booking?.products) ? booking.products.length : 0,
    first_product_keys: product ? Object.keys(product).sort() : [],
    first_product_sample: product,
    // Try common candidate field names on the product
    candidates_on_product: product ? {
      tags: product.tags,
      tags_en: product.tags_en,
      categories: product.categories,
      category: product.category,
      labels: product.labels,
      product_type: product.product_type,
      type: product.type,
      product_tags: product.product_tags,
      product_category: product.product_category,
      group: product.group,
      groups: product.groups,
    } : null,
    // And on the booking itself
    candidates_on_booking: booking ? {
      tags: booking.tags,
      tags_en: booking.tags_en,
      categories: booking.categories,
      labels: booking.labels,
    } : null,
    raw_text_preview: text.slice(0, 400),
  }

  return new Response(JSON.stringify(analysis, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
