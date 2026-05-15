// sync-external-suppliers
// Pull-synk från externa leverantörsregistret in i public.external_suppliers
// + public.external_supplier_contacts.
//
// Mönster:
//  - Initial körning per organisation: full pull med ?limit=1000 + cursor.
//  - Efterföljande körningar: delta via ?updated_since=<last_updated_at_seen>.
//  - State per org sparas i public.external_supplier_sync_state.
//
// Triggas via cron eller manuellt POST { organization_id?, mode? }.
// mode: "auto" (default), "full" (tvinga full pull), "delta".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMOTE_BASE = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/external-suppliers'
const PAGE_LIMIT = 1000
const MAX_PAGES_PER_RUN = 50 // safety cap

interface RemoteContact {
  id?: string
  name?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  is_primary?: boolean | null
  notes?: string | null
}

interface RemoteSupplier {
  id: string
  name: string
  organization_number?: string | null
  vat_number?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address_line1?: string | null
  address_line2?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  notes?: string | null
  is_active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  contacts?: RemoteContact[]
}

interface RemoteResponse {
  success: boolean
  data: RemoteSupplier[]
  next_cursor?: string | null
  error?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchPage(
  apiKey: string,
  orgId: string,
  params: Record<string, string>,
): Promise<RemoteResponse> {
  const qs = new URLSearchParams(params).toString()
  const url = `${REMOTE_BASE}${qs ? `?${qs}` : ''}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'x-organization-id': orgId,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`remote_http_${res.status}: ${text.substring(0, 300)}`)
  }
  return JSON.parse(text)
}

async function syncOrganization(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  orgId: string,
  mode: 'auto' | 'full' | 'delta',
): Promise<{
  org_id: string
  pages: number
  suppliers_upserted: number
  contacts_upserted: number
  contacts_deleted: number
  max_updated_at: string | null
  used_mode: 'full' | 'delta'
  next_cursor: string | null
  ms: number
}> {
  const start = Date.now()

  // Resolve effective mode
  const { data: state } = await admin
    .from('external_supplier_sync_state')
    .select('last_updated_at_seen')
    .eq('organization_id', orgId)
    .maybeSingle()

  const lastSeen = (state as any)?.last_updated_at_seen as string | null
  const effectiveMode: 'full' | 'delta' =
    mode === 'full' ? 'full' : mode === 'delta' ? 'delta' : lastSeen ? 'delta' : 'full'

  let cursor: string | null = null
  let pages = 0
  let suppliersUpserted = 0
  let contactsUpserted = 0
  let contactsDeleted = 0
  let maxUpdatedAt: string | null = lastSeen

  for (let i = 0; i < MAX_PAGES_PER_RUN; i++) {
    const params: Record<string, string> = { limit: String(PAGE_LIMIT) }
    if (cursor) params.cursor = cursor
    if (effectiveMode === 'delta' && lastSeen) params.updated_since = lastSeen

    const page = await fetchPage(apiKey, orgId, params)
    pages++

    const rows = page.data ?? []
    if (rows.length > 0) {
      const supplierRows = rows.map((s) => ({
        organization_id: orgId,
        external_id: s.id,
        organization_number: s.organization_number ?? null,
        name: s.name,
        vat_number: s.vat_number ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        website: s.website ?? null,
        address_line1: s.address_line1 ?? null,
        address_line2: s.address_line2 ?? null,
        postal_code: s.postal_code ?? null,
        city: s.city ?? null,
        country: s.country ?? null,
        notes: s.notes ?? null,
        is_active: s.is_active ?? true,
        external_created_at: s.created_at ?? null,
        external_updated_at: s.updated_at ?? null,
        raw: s as unknown as Record<string, unknown>,
        last_synced_at: new Date().toISOString(),
      }))

      const { data: upserted, error: upErr } = await admin
        .from('external_suppliers')
        .upsert(supplierRows, { onConflict: 'organization_id,external_id' })
        .select('id, external_id')

      if (upErr) throw new Error(`upsert_suppliers: ${upErr.message}`)
      suppliersUpserted += upserted?.length ?? 0

      // Map external_id -> internal id for contact upserts
      const idByExternal = new Map<string, string>(
        (upserted ?? []).map((r: any) => [r.external_id as string, r.id as string]),
      )

      // Contacts: replace-set per supplier (delete missing, upsert provided)
      const contactRows: any[] = []
      const supplierExternalIds: string[] = []
      for (const s of rows) {
        const supplierInternalId = idByExternal.get(s.id)
        if (!supplierInternalId) continue
        supplierExternalIds.push(s.id)
        for (const c of s.contacts ?? []) {
          if (!c.id) continue
          contactRows.push({
            organization_id: orgId,
            supplier_id: supplierInternalId,
            external_id: c.id,
            supplier_external_id: s.id,
            name: c.name ?? null,
            title: c.title ?? null,
            email: c.email ?? null,
            phone: c.phone ?? null,
            mobile: c.mobile ?? null,
            is_primary: c.is_primary ?? false,
            notes: c.notes ?? null,
            raw: c as unknown as Record<string, unknown>,
            last_synced_at: new Date().toISOString(),
          })
        }
      }

      if (contactRows.length > 0) {
        const { data: upC, error: cErr } = await admin
          .from('external_supplier_contacts')
          .upsert(contactRows, { onConflict: 'organization_id,external_id' })
          .select('id')
        if (cErr) throw new Error(`upsert_contacts: ${cErr.message}`)
        contactsUpserted += upC?.length ?? 0
      }

      // Delete contacts that no longer exist for the suppliers we just synced
      if (supplierExternalIds.length > 0) {
        const keepIds = contactRows.map((c) => c.external_id)
        let delQuery = admin
          .from('external_supplier_contacts')
          .delete({ count: 'exact' })
          .eq('organization_id', orgId)
          .in('supplier_external_id', supplierExternalIds)
        if (keepIds.length > 0) {
          delQuery = delQuery.not('external_id', 'in', `(${keepIds.map((k) => `"${k}"`).join(',')})`)
        }
        const { count: delCount, error: delErr } = await delQuery
        if (delErr) {
          console.warn(`[sync-external-suppliers] contact cleanup failed org=${orgId}: ${delErr.message}`)
        } else {
          contactsDeleted += delCount ?? 0
        }
      }

      // Track max updated_at
      for (const s of rows) {
        if (s.updated_at && (!maxUpdatedAt || s.updated_at > maxUpdatedAt)) {
          maxUpdatedAt = s.updated_at
        }
      }
    }

    cursor = page.next_cursor ?? null
    if (!cursor) break
  }

  // Persist state
  await admin
    .from('external_supplier_sync_state')
    .upsert(
      {
        organization_id: orgId,
        last_updated_at_seen: maxUpdatedAt,
        last_sync_at: new Date().toISOString(),
        last_status: cursor ? 'partial_more_pages' : 'ok',
        last_error: null,
        last_run_stats: {
          pages,
          suppliers_upserted: suppliersUpserted,
          contacts_upserted: contactsUpserted,
          contacts_deleted: contactsDeleted,
          mode: effectiveMode,
        },
      },
      { onConflict: 'organization_id' },
    )

  return {
    org_id: orgId,
    pages,
    suppliers_upserted: suppliersUpserted,
    contacts_upserted: contactsUpserted,
    contacts_deleted: contactsDeleted,
    max_updated_at: maxUpdatedAt,
    used_mode: effectiveMode,
    next_cursor: cursor,
    ms: Date.now() - start,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const apiKey = Deno.env.get('PRICELIST_API_KEY')
    if (!apiKey) return json({ error: 'missing PRICELIST_API_KEY (anon key for external API)' }, 500)

    const admin = createClient(supabaseUrl, serviceKey)

    const body =
      req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const url = new URL(req.url)
    const targetOrg: string | undefined =
      body.organization_id || url.searchParams.get('organization_id') || undefined
    const mode: 'auto' | 'full' | 'delta' =
      (body.mode || url.searchParams.get('mode') || 'auto') as any

    let orgIds: string[] = []
    if (targetOrg) {
      orgIds = [targetOrg]
    } else {
      const { data: orgs, error } = await admin.from('organizations').select('id')
      if (error) throw error
      orgIds = (orgs ?? []).map((o: any) => o.id)
    }

    const results: any[] = []
    for (const orgId of orgIds) {
      try {
        const r = await syncOrganization(admin, apiKey, orgId, mode)
        results.push({ ...r, status: 'ok' })
      } catch (err: any) {
        const msg = String(err?.message ?? err)
        console.error(`[sync-external-suppliers] org=${orgId} failed:`, msg)
        await admin
          .from('external_supplier_sync_state')
          .upsert(
            {
              organization_id: orgId,
              last_sync_at: new Date().toISOString(),
              last_status: 'error',
              last_error: msg.substring(0, 500),
            },
            { onConflict: 'organization_id' },
          )
        results.push({ org_id: orgId, status: 'error', error: msg })
      }
    }

    return json({ success: true, mode, count: results.length, results })
  } catch (e: any) {
    return json({ success: false, error: String(e?.message ?? e) }, 500)
  }
})
