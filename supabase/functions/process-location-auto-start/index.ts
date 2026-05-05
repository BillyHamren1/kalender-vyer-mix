// @ts-nocheck
// HTTP wrapper for the server-side auto-start engine.
// All logic lives in ./engine.ts so it can be unit-tested in isolation
// (see scenario_test.ts) without ever touching production data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { runEngine, corsHeaders } from './engine.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  let body: any = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch { body = {} }
  } else {
    const url = new URL(req.url)
    body = Object.fromEntries(url.searchParams.entries())
  }

  try {
    const report = await runEngine(supabase, body)
    return new Response(JSON.stringify({ ok: true, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[process-location-auto-start] fatal', e)
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
