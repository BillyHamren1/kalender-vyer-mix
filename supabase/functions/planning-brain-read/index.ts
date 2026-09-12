/**
 * planning-brain-read.v1 — signed, tenant-scoped, strictly READ-ONLY Planning seam
 * for EventFlow Agent Core (BRAIN). No writes, no provider/model calls, no
 * service-role exposure to any client, no cross-tenant reads.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import {
  buildPlanningBrainProjection,
  parsePlanningBrainReadRequest,
  verifyPlanningBrainSignature,
} from '../_shared/planning-brain-read-contract.ts'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const secret = Deno.env.get('PLANNING_BRAIN_READ_SIGNING_SECRET') ?? ''
  if (!secret) return json(503, { error: 'not_configured' })

  const rawBody = await request.text()
  const authorized = await verifyPlanningBrainSignature({
    secret,
    rawBody,
    timestamp: request.headers.get('x-planning-timestamp'),
    nonce: request.headers.get('x-planning-nonce'),
    signature: request.headers.get('x-planning-signature'),
  })
  if (!authorized) return json(401, { error: 'invalid_signature' })

  const body = (() => { try { return JSON.parse(rawBody || 'null') } catch { return null } })()
  const parsed = parsePlanningBrainReadRequest(body)
  if (!parsed.ok) return json(400, { error: parsed.error })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(503, { error: 'service_not_configured' })
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const org = parsed.value.organizationId
  const { from, to } = parsed.value

  const orgResult = await admin.from('organizations').select('id').eq('id', org).maybeSingle()
  if (orgResult.error) return json(503, { error: 'organization_lookup_failed' })
  if (!orgResult.data) return json(404, { error: 'organization_not_found' })

  const [projectsResult, eventsResult, assignmentsResult] = await Promise.all([
    admin.from('projects')
      .select('id, organization_id, booking_id, status, planning_status, is_internal, rigdaydate, eventdate, rigdowndate')
      .eq('organization_id', org)
      .is('deleted_at', null)
      .or(`and(rigdaydate.gte.${from},rigdaydate.lte.${to}),and(eventdate.gte.${from},eventdate.lte.${to}),and(rigdowndate.gte.${from},rigdowndate.lte.${to})`),
    admin.from('calendar_events')
      .select('id, organization_id, booking_id, resource_id, event_type, source_date, start_time, end_time, times_locked')
      .eq('organization_id', org)
      .gte('source_date', from)
      .lte('source_date', to),
    admin.from('booking_staff_assignments')
      .select('id, organization_id, booking_id, staff_id, team_id, role, assignment_date')
      .eq('organization_id', org)
      .gte('assignment_date', from)
      .lte('assignment_date', to),
  ])

  if (projectsResult.error || eventsResult.error || assignmentsResult.error) {
    return json(503, { error: 'planning_read_failed' })
  }

  const projection = buildPlanningBrainProjection({
    request: parsed.value,
    generatedAt: new Date().toISOString(),
    rows: {
      projects: projectsResult.data ?? [],
      calendarEvents: eventsResult.data ?? [],
      assignments: assignmentsResult.data ?? [],
    },
  })
  return json(200, projection)
}

if (import.meta.main) Deno.serve(handleRequest)
