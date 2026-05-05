// @ts-nocheck
// HTTP wrapper for the server-side auto-start engine.
// All engine logic lives in ./engine.ts so it can be unit-tested in isolation
// (see scenario_test.ts) without ever touching production data.
//
// ── Mode contract ───────────────────────────────────────────────────────────
// Inputs (POST JSON or querystring) — STRICT:
//   mode:       'cron' | 'backfill'   (required)
//   dry_run:    boolean               (default true; safe by design)
//   confirm:    boolean               (REQUIRED when dry_run=false)
//   For mode='backfill':
//     date:            'YYYY-MM-DD'   (required)
//     organization_id: uuid           (optional — scope to one org)
//     staff_id:        uuid           (optional — scope to one staff)
//   For mode='cron':
//     (no extra inputs — processes pings since stored cursor)
//
// Apply rules:
//   * dry_run defaults to true. To write rows you MUST send
//     `dry_run=false` AND `confirm=true`.
//   * Missing confirm with dry_run=false → 400.
//   * Cron always uses cursor; backfill ignores cursor and is bounded by date.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { runEngine, corsHeaders } from './engine.ts'

function asBool(v: any, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase().trim()
  if (s === 'true' || s === '1' || s === 'yes') return true
  if (s === 'false' || s === '0' || s === 'no') return false
  return fallback
}

function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  let raw: any = {}
  if (req.method === 'POST') {
    try { raw = await req.json() } catch { raw = {} }
  } else {
    const url = new URL(req.url)
    raw = Object.fromEntries(url.searchParams.entries())
  }

  // ── Validate mode ─────────────────────────────────────────────────────────
  // Accept legacy `action` alias too.
  const rawMode = String(raw.mode ?? raw.action ?? '').toLowerCase().trim()
  const mode = rawMode === 'backfill' || rawMode === 'backfill_day' ? 'backfill'
            : rawMode === 'cron' ? 'cron'
            : null

  if (!mode) {
    return jsonResponse(400, {
      ok: false,
      error: "mode required: 'cron' or 'backfill'",
    })
  }

  // dry_run defaults to TRUE — safety first
  const dryRun = asBool(raw.dry_run, true)
  const confirm = asBool(raw.confirm, false)

  if (!dryRun && !confirm) {
    return jsonResponse(400, {
      ok: false,
      error: 'apply blocked: dry_run=false requires confirm=true',
      hint: 'Add { "confirm": true } to the request body to actually write rows.',
    })
  }

  // Backfill needs a valid date
  if (mode === 'backfill') {
    const date = String(raw.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse(400, {
        ok: false,
        error: "backfill requires date='YYYY-MM-DD'",
      })
    }
  }

  // Build engine payload — engine still uses 'backfill_day' internally
  const enginePayload = {
    action: mode === 'backfill' ? 'backfill_day' : 'cron',
    dry_run: dryRun,
    date: raw.date,
    organization_id: raw.organization_id ?? null,
    staff_id: raw.staff_id ?? null,
  }

  try {
    const report = await runEngine(supabase, enginePayload)
    return jsonResponse(200, {
      ok: true,
      mode,
      dry_run: dryRun,
      confirmed: !dryRun && confirm,
      report,
    })
  } catch (e: any) {
    console.error('[process-location-auto-start] fatal', e)
    return jsonResponse(500, { ok: false, error: e?.message ?? String(e) })
  }
})
