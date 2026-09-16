// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const WMS_BASE_URL = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const safeInt = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return json({ error: 'unauthorized' }, 401)

  const { data: userResult, error: userError } = await admin.auth.getUser(token)
  const user = userResult?.user
  if (userError || !user) return json({ error: 'unauthorized' }, 401)

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    admin.from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle(),
    admin.from('user_roles').select('role, organization_id').eq('user_id', user.id),
  ])
  const organizationId = profile?.organization_id
  if (!organizationId) return json({ error: 'forbidden' }, 403)
  const allowed = (roleRows || []).some((row: any) =>
    row.organization_id === organizationId && (row.role === 'admin' || row.role === 'lager')
  )
  if (!allowed) return json({ error: 'forbidden' }, 403)

  const apiKey = Deno.env.get('INVENTORY_PACKABILITY_API_KEY') || ''
  if (!apiKey) return json({ error: 'wms_not_configured' }, 503)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'invalid_request' }, 400)
  const action = body.action
  let method = 'GET'
  let path = '/item-types'
  let upstreamBody: unknown = undefined

  if (action === 'list') {
    const params = new URLSearchParams({
      include_packability: 'true',
      limit: String(Math.min(safeInt(body.limit, 100), 500)),
      offset: String(safeInt(body.offset, 0)),
    })
    if (typeof body.search === 'string' && body.search.trim()) params.set('search', body.search.trim())
    path += `?${params.toString()}`
  } else if (action === 'update_packability') {
    const item = Array.isArray(body.items) ? body.items[0] : null
    if (!item?.id || !isBoolean(item.is_packable_default)) return json({ error: 'invalid_packability' }, 422)
    method = 'PATCH'
    path += `/${encodeURIComponent(item.id)}/packability`
    upstreamBody = {
      is_packable_default: item.is_packable_default,
      expected_revision: safeInt(item.expected_revision, 0),
    }
  } else if (action === 'bulk_update_packability') {
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 500) {
      return json({ error: 'invalid_packability' }, 422)
    }
    const items = body.items.map((item: any) => ({
      item_type_id: typeof item?.id === 'string' ? item.id : '',
      is_packable_default: item?.is_packable_default,
      expected_revision: safeInt(item?.expected_revision, 0),
    }))
    if (items.some((item: any) => !item.item_type_id || !isBoolean(item.is_packable_default))) {
      return json({ error: 'invalid_packability' }, 422)
    }
    method = 'POST'
    path += '/packability/bulk'
    upstreamBody = { changes: items }
  } else {
    return json({ error: 'invalid_action' }, 400)
  }

  const idempotencyKey = req.headers.get('x-idempotency-key') || crypto.randomUUID()
  const upstreamResponse = await fetch(`${WMS_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'x-organization-id': organizationId,
      'x-actor-user-id': user.id,
      'x-source': 'eventflow-inventory',
      'Idempotency-Key': idempotencyKey,
    },
    body: upstreamBody === undefined ? undefined : JSON.stringify(upstreamBody),
  }).catch(() => null)

  if (!upstreamResponse) return json({ error: 'wms_unavailable' }, 502)
  const responseBody = await upstreamResponse.json().catch(() => ({ error: 'invalid_wms_response' }))
  return json(responseBody, upstreamResponse.status)
})
