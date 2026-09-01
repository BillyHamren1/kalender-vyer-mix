// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { repairPackingItems } from '../_shared/packingRepair.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * repair-packing-items
 *
 * Explicit, användarinitierad generering av SAKNADE packrader för en packning
 * som redan finns men står tom (eller ofullständig). Aldrig automatisk.
 * Endast status planning/in_progress. Raderar aldrig något.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(jwt)
    const user = userData?.user || null
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.organization_id) return json({ error: 'Organization access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const packingId: string | null = body?.packing_id || null
    if (!packingId) return json({ error: 'packing_id is required' }, 400)

    const result = await repairPackingItems(supabase, packingId, profile.organization_id)
    console.log('[repair-packing-items]', packingId, JSON.stringify(result))

    if (!result.ok) {
      const status = result.code === 'packing_not_found' ? 404
        : result.code === 'insert_failed' ? 500
        : 409
      return json({ error: result.error, code: result.code }, status)
    }

    return json({ success: true, inserted: result.inserted, total: result.total })
  } catch (err) {
    console.error('[repair-packing-items] error', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
