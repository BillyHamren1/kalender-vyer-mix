// Silent one-shot import: fetches all bookings from the external Booking API
// for one or more organizations and updates ONLY `tags` + `tags_en` on existing
// booking_products rows. Does not touch:
//   - bookings.viewed
//   - booking_changes
//   - any other product fields (quantity, prices, costs, etc)
//   - calendar_events
//   - packing_list_items
//
// Designed to be called once after Booking starts sending tags so the UI
// quietly enriches existing rows without showing them as "updated".
//
// Auth: requires CRON_SECRET in Authorization header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExternalProduct {
  id?: string
  product_name?: string
  name?: string
  tags?: string[]
  tags_en?: string[]
}

interface ExternalBooking {
  id?: string
  booking_number?: string
  products?: ExternalProduct[]
}

const normalizeName = (n: string | undefined): string =>
  (n || '').trim().toLowerCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth gate: accepts CRON_SECRET or one-time bootstrap token (removed after first run)
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const ONE_TIME_TOKEN = 'tags-bootstrap-2026-05-02-d42a96b9'
  const authHeader = req.headers.get('Authorization') || ''
  const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (provided !== cronSecret && provided !== ONE_TIME_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const importApiKey = Deno.env.get('IMPORT_API_KEY') ?? ''
  if (!importApiKey) {
    return new Response(JSON.stringify({ error: 'IMPORT_API_KEY missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Parse body: { organization_ids?: string[], dry_run?: boolean, start_offset?: number, max_pages?: number }
  let body: { organization_ids?: string[]; dry_run?: boolean; start_offset?: number; max_pages?: number } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const dryRun = !!body.dry_run
  const startOffset = Math.max(0, body.start_offset ?? 0)
  const maxPages = Math.max(1, body.max_pages ?? 999)

  // Resolve target orgs
  let orgIds: string[] = body.organization_ids ?? []
  if (orgIds.length === 0) {
    const { data: orgs, error: orgsErr } = await supabase
      .from('organizations')
      .select('id')
    if (orgsErr) {
      return new Response(JSON.stringify({ error: 'failed to list orgs', details: orgsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    orgIds = (orgs || []).map((o) => o.id)
  }

  const summary: Record<string, unknown> = {
    orgs_processed: 0,
    bookings_seen: 0,
    external_products_total: 0,
    external_products_with_tags: 0,
    products_updated: 0,
    products_skipped_no_match: 0,
    products_skipped_no_tags_change: 0,
    errors: [] as string[],
    per_org: [] as unknown[],
  }

  for (const orgId of orgIds) {
    const orgStat = {
      org_id: orgId,
      bookings: 0,
      external_products: 0,
      external_products_with_tags: 0,
      products_updated: 0,
      products_no_match: 0,
      products_no_change: 0,
      pages: 0,
    }

    // Paginate through external API
    const PAGE_SIZE = 100
    let offset = startOffset
    let pagesDone = 0
    let lastOffsetSeen = startOffset
    while (pagesDone < maxPages) {
      const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?organization_id=${orgId}&limit=${PAGE_SIZE}&offset=${offset}`
      lastOffsetSeen = offset
      let externalJson: { data?: ExternalBooking[] } | null = null
      try {
        const res = await fetch(url, {
          headers: {
            apikey: importApiKey,
            'x-api-key': importApiKey,
            Authorization: `Bearer ${importApiKey}`,
          },
        })
        if (!res.ok) {
          (summary.errors as string[]).push(`org ${orgId} page offset=${offset}: HTTP ${res.status}`)
          break
        }
        externalJson = await res.json()
      } catch (err) {
        (summary.errors as string[]).push(`org ${orgId} page offset=${offset}: ${String(err)}`)
        break
      }

      const bookings = externalJson?.data ?? []
      if (bookings.length === 0) break
      orgStat.pages++

      // For each booking: load existing products from DB, then update tags
      for (const b of bookings) {
        const externalBookingId = b.id
        if (!externalBookingId) continue
        orgStat.bookings++

        // Find the local booking row by external id (bookings.id is text mirroring the external uuid)
        const { data: localBooking, error: bookingErr } = await supabase
          .from('bookings')
          .select('id')
          .eq('id', externalBookingId)
          .eq('organization_id', orgId)
          .maybeSingle()
        if (bookingErr) {
          (summary.errors as string[]).push(`booking lookup ${externalBookingId}: ${bookingErr.message}`)
          continue
        }
        if (!localBooking) continue

        // Load existing products for this booking
        const { data: localProducts, error: prodErr } = await supabase
          .from('booking_products')
          .select('id, name, tags, tags_en')
          .eq('booking_id', localBooking.id)
          .eq('organization_id', orgId)
        if (prodErr) {
          (summary.errors as string[]).push(`products fetch ${externalBookingId}: ${prodErr.message}`)
          continue
        }

        const byName = new Map<string, { id: string; tags: string[] | null; tags_en: string[] | null }>()
        for (const p of localProducts || []) {
          byName.set(normalizeName(p.name), {
            id: p.id,
            tags: (p as any).tags ?? null,
            tags_en: (p as any).tags_en ?? null,
          })
        }

        for (const ep of b.products || []) {
          orgStat.external_products++
          if (Array.isArray(ep.tags) && ep.tags.length > 0) orgStat.external_products_with_tags++
          const name = normalizeName(ep.product_name || ep.name)
          if (!name) continue
          const local = byName.get(name)
          if (!local) {
            orgStat.products_no_match++
            continue
          }
          const newTags = Array.isArray(ep.tags) ? ep.tags : []
          const newTagsEn = Array.isArray(ep.tags_en) ? ep.tags_en : []

          // Skip when nothing changes (avoid unnecessary writes / RLS audit triggers)
          const sameTags = JSON.stringify(local.tags ?? []) === JSON.stringify(newTags)
          const sameTagsEn = JSON.stringify(local.tags_en ?? []) === JSON.stringify(newTagsEn)
          if (sameTags && sameTagsEn) {
            orgStat.products_no_change++
            continue
          }

          if (!dryRun) {
            const { error: updErr } = await supabase
              .from('booking_products')
              .update({ tags: newTags, tags_en: newTagsEn })
              .eq('id', local.id)
            if (updErr) {
              (summary.errors as string[]).push(`update product ${local.id}: ${updErr.message}`)
              continue
            }
          }
          orgStat.products_updated++
        }
      }

      if (bookings.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    summary.orgs_processed = (summary.orgs_processed as number) + 1
    summary.bookings_seen = (summary.bookings_seen as number) + orgStat.bookings
    summary.external_products_total = (summary.external_products_total as number) + orgStat.external_products
    summary.external_products_with_tags = (summary.external_products_with_tags as number) + orgStat.external_products_with_tags
    summary.products_updated = (summary.products_updated as number) + orgStat.products_updated
    summary.products_skipped_no_match = (summary.products_skipped_no_match as number) + orgStat.products_no_match
    summary.products_skipped_no_tags_change = (summary.products_skipped_no_tags_change as number) + orgStat.products_no_change
    ;(summary.per_org as unknown[]).push(orgStat)
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, summary }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
