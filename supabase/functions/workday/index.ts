// @ts-nocheck
/**
 * workday — server-anchor for the mobile WorkDay timer.
 *
 * Endpoints (POST `/workday`, body `{ action: 'start' | 'end' | 'current', ... }`):
 *
 *   - start   { startedAtIso?: string, notes?: string }
 *       Idempotent: if there is already an OPEN workday for the staff,
 *       return it. Otherwise insert a new row.
 *
 *   - end     { endedAtIso?: string, notes?: string }
 *       Closes the open workday (sets ended_at). Idempotent: if no open
 *       workday exists, returns { workday: null }.
 *
 *   - current
 *       Returns the currently OPEN workday for the staff (or null).
 *
 * Auth: same custom token format as `mobile-app-api` — `Authorization:
 * Bearer <btoa-json-token>`. We re-implement the tiny verify so this
 * function stays self-contained.
 *
 * Org isolation: organization_id is read from `staff_members.organization_id`
 * for the authenticated staff_id and enforced server-side on every write.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VerifiedToken {
  valid: boolean
  staffId?: string
  error?: string
}

function verifyToken(token: string): VerifiedToken {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) return { valid: false, error: 'Invalid token format' }
    if (Date.now() > payload.expiresAt) return { valid: false, error: 'Token expired' }
    return { valid: true, staffId: payload.staffId }
  } catch {
    return { valid: false, error: 'Invalid token' }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status)
}

function isIso(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const ts = Date.parse(value)
  return Number.isFinite(ts)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // Auth
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return errorResponse('Missing token', 401)
  const tokenResult = verifyToken(token)
  if (!tokenResult.valid || !tokenResult.staffId) {
    return errorResponse(tokenResult.error || 'Invalid token', 401)
  }
  const staffId = tokenResult.staffId

  // Body
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorResponse('Invalid JSON', 400)
  }
  const action = body.action
  if (action !== 'start' && action !== 'end' && action !== 'current') {
    return errorResponse('Invalid action (expected start | end | current)', 400)
  }

  // Supabase service-role client (bypasses RLS — authorization done above).
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Resolve org for the staff member (single source of truth: staff_members).
  const { data: staffRow, error: staffErr } = await supabase
    .from('staff_members')
    .select('id, organization_id')
    .eq('id', staffId)
    .maybeSingle()
  if (staffErr) return errorResponse(`Staff lookup failed: ${staffErr.message}`, 500)
  if (!staffRow?.organization_id) return errorResponse('Staff not found', 404)
  const organizationId = staffRow.organization_id

  // Helper: fetch the currently-open workday for this staff (ended_at IS NULL).
  async function fetchOpen() {
    return await supabase
      .from('workdays')
      .select('id, organization_id, staff_id, started_at, ended_at, started_by, ended_by, notes, created_at, updated_at')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  if (action === 'current') {
    const { data, error } = await fetchOpen()
    if (error) return errorResponse(`Failed to load workday: ${error.message}`, 500)
    return jsonResponse({ workday: data ?? null })
  }

  if (action === 'start') {
    const startedAtIso = body.startedAtIso
    const notes = typeof body.notes === 'string' ? body.notes : null
    if (startedAtIso !== undefined && !isIso(startedAtIso)) {
      return errorResponse('startedAtIso must be a valid ISO timestamp', 400)
    }
    const startedAt = isIso(startedAtIso) ? startedAtIso : new Date().toISOString()

    // Idempotent: return existing open row if any.
    const existing = await fetchOpen()
    if (existing.error) return errorResponse(`Failed to load workday: ${existing.error.message}`, 500)
    if (existing.data) {
      // If the caller is back-dating earlier than what we have stored, move
      // the start backwards. The server `workdays` row is the single source
      // of truth — there is no client-side day clock to mirror any more.
      const storedTs = Date.parse(existing.data.started_at)
      const incomingTs = Date.parse(startedAt)
      if (Number.isFinite(storedTs) && Number.isFinite(incomingTs) && incomingTs < storedTs) {
        const upd = await supabase
          .from('workdays')
          .update({ started_at: startedAt })
          .eq('id', existing.data.id)
          .select()
          .maybeSingle()
        if (upd.error) return errorResponse(`Failed to update workday: ${upd.error.message}`, 500)
        return jsonResponse({ workday: upd.data, created: false, updated: true })
      }
      return jsonResponse({ workday: existing.data, created: false, updated: false })
    }

    const ins = await supabase
      .from('workdays')
      .insert({
        organization_id: organizationId,
        staff_id: staffId,
        started_at: startedAt,
        started_by: staffId,
        notes,
      })
      .select()
      .maybeSingle()
    if (ins.error) return errorResponse(`Failed to start workday: ${ins.error.message}`, 500)
    return jsonResponse({ workday: ins.data, created: true })
  }

  // action === 'end'
  const endedAtIso = body.endedAtIso
  const notes = typeof body.notes === 'string' ? body.notes : undefined
  if (endedAtIso !== undefined && !isIso(endedAtIso)) {
    return errorResponse('endedAtIso must be a valid ISO timestamp', 400)
  }
  const endedAt = isIso(endedAtIso) ? endedAtIso : new Date().toISOString()

  const existing = await fetchOpen()
  if (existing.error) return errorResponse(`Failed to load workday: ${existing.error.message}`, 500)
  if (!existing.data) return jsonResponse({ workday: null, alreadyClosed: true })

  // Don't allow closing before the start.
  const startedTs = Date.parse(existing.data.started_at)
  const endedTs = Date.parse(endedAt)
  if (Number.isFinite(startedTs) && Number.isFinite(endedTs) && endedTs < startedTs) {
    return errorResponse('endedAtIso must be after started_at', 400)
  }

  const upd = await supabase
    .from('workdays')
    .update({
      ended_at: endedAt,
      ended_by: staffId,
      ...(notes !== undefined ? { notes } : {}),
    })
    .eq('id', existing.data.id)
    .select()
    .maybeSingle()
  if (upd.error) return errorResponse(`Failed to end workday: ${upd.error.message}`, 500)
  return jsonResponse({ workday: upd.data, alreadyClosed: false })
})
