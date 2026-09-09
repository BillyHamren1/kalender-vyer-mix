// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * edit-packing-list
 *
 * Planning-webbens ENDA mutativa väg för packlistan, och endast för
 * mjuk exkludering/återställning av rader när packningen har status
 * exakt 'planning'.
 *
 * SÄKERHET:
 *  - JWT valideras med auth.getUser innan något annat sker.
 *  - organization_id hämtas ALLTID från profiles (aldrig från request-body).
 *  - All logik körs i en atomisk Postgres-RPC (status, låsning, guards,
 *    update, audit, verifiering) med service role.
 *  - Ingen DELETE. Bokningar och booking_products rörs aldrig.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const ERROR_MESSAGES: Record<string, string> = {
  packing_not_found: 'Packningen hittades inte i din organisation.',
  packing_not_in_planning: 'Packlistan kan bara redigeras när packningen är i planeringsläge.',
  item_not_found: 'Raden finns inte i den här packlistan.',
  not_planning_excluded:
    'Raden togs inte bort i planeringen och kan därför inte återställas härifrån.',
  row_touched:
    'Raden (eller en paketdel) är redan packad, kontrollerad eller lagd i kolli och kan inte tas bort.',
  verification_failed: 'Ändringen kunde inte verifieras och rullades tillbaka.',
  invalid_mode: 'Ogiltig åtgärd.',
}


const mapDbError = (message: string): { code: string; message: string; status: number } => {
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(code)) {
      const status = code === 'item_not_found' || code === 'packing_not_found' ? 404 : 409
      return { code, message: ERROR_MESSAGES[code], status }
    }
  }
  return { code: 'edit_failed', message: 'Kunde inte uppdatera packlistan.', status: 500 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405)
  }



  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)

    const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
    const user = userData?.user || null
    if (authError || !user) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError || !profile?.organization_id) {
      return json({ error: 'Organization access required', code: 'no_organization' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const packingId: string | null = body?.packing_id || null
    const itemId: string | null = body?.item_id || null
    const mode: string = body?.mode || ''

    if (!packingId || !itemId) {
      return json({ error: 'packing_id och item_id krävs', code: 'bad_request' }, 400)
    }
    if (mode !== 'exclude' && mode !== 'restore') {
      return json({ error: ERROR_MESSAGES.invalid_mode, code: 'invalid_mode' }, 400)
    }

    const { data, error } = await supabase.rpc('planning_edit_packing_list_item', {
      _packing_id: packingId,
      _organization_id: profile.organization_id,
      _item_id: itemId,
      _mode: mode,
      _actor_name: profile.full_name || user.email || 'Planning',
      _actor_id: user.id,
    })

    if (error) {
      const mapped = mapDbError(error.message || '')
      console.error('[edit-packing-list] rpc failed', mapped.code, error.message)
      return json({ error: mapped.message, code: mapped.code }, mapped.status)
    }

    return json({ ...(data || {}), booking_unchanged: true })
  } catch (err) {
    console.error('[edit-packing-list] unexpected', err)
    return json({ error: 'Kunde inte uppdatera packlistan.', code: 'unexpected' }, 500)
  }
})
