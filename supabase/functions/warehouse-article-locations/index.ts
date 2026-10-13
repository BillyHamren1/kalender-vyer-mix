// @ts-nocheck
// Read-only desktop (Operations) proxy for warehouse-article-locations.v1.
// Auth: Supabase JWT → profiles.organization_id (same as edit-packing-list).
// Tenant/actor resolved on server; body organization is ignored.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildArticleLocationsRequest, fetchArticleLocations, isUuid } from '../_shared/warehouseArticleLocations.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405)
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
    if (!jwt) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
    const user = userData?.user || null
    if (authError || !user) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('organization_id, full_name').eq('user_id', user.id).maybeSingle()
    if (profileError || !profile?.organization_id) {
      return json({ error: 'Organization access required', code: 'no_organization' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const itemTypeId = body?.itemTypeId
    const instanceId = body?.instanceId ?? null
    if (!isUuid(itemTypeId) || (instanceId !== null && !isUuid(instanceId))) {
      return json({ error: 'itemTypeId/instanceId måste vara giltiga UUID', code: 'invalid_request' }, 400)
    }

    // personnelId: org-bound staff member if one exists for this user, else the auth user id.
    let personnelId = user.id
    if (user.email) {
      const { data: staff } = await supabase.from('staff_members').select('id')
        .eq('organization_id', profile.organization_id).ilike('email', user.email).limit(1).maybeSingle()
      if (staff?.id) personnelId = staff.id
    }

    const result = await fetchArticleLocations(
      buildArticleLocationsRequest({
        deviceId: 'planning-operations-desktop',
        actor: { organizationId: profile.organization_id, personnelId, label: profile.full_name || user.email || personnelId },
        itemTypeId, instanceId,
      }),
      { hmacSecret: Deno.env.get('PLANNING_WMS_HMAC_SECRET') || '' },
    )
    if (!result.ok) {
      console.warn('[warehouse-article-locations] failed', result.code, result.upstreamCode ?? '')
      return json({ error: result.error, code: result.code, upstreamCode: result.upstreamCode ?? null }, result.status)
    }
    return json(result.data)
  } catch (err) {
    console.error('[warehouse-article-locations] error', err?.message)
    return json({ error: 'Internt fel', code: 'internal_error' }, 500)
  }
})
