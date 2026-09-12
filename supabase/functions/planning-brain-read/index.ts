/**
 * planning-brain-read.v1 — signed, tenant-scoped, strictly READ-ONLY Planning seam
 * for EventFlow Agent Core (BRAIN). No writes, no provider/model calls, no
 * service-role exposure to any client, no cross-tenant reads.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import {
  PLANNING_BRAIN_ACTOR_ROLES,
  PLANNING_BRAIN_NONCE_TTL_SECONDS,
  buildPlanningBrainProjection,
  decidePlanningBrainActor,
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

  // Replay safety: server-owned one-time nonce consumption (security primitive,
  // the ONLY mutating call in this route — never business data).
  const nonceResult = await admin.rpc('consume_planning_brain_read_nonce', {
    _nonce: request.headers.get('x-planning-nonce'),
    _organization_id: org,
    _ttl_seconds: PLANNING_BRAIN_NONCE_TTL_SECONDS,
  })
  if (nonceResult.error) return json(503, { error: 'nonce_store_unavailable' })
  if (nonceResult.data !== true) return json(401, { error: 'nonce_replayed' })

  const orgResult = await admin.from('organizations').select('id').eq('id', org).maybeSingle()
  if (orgResult.error) return json(503, { error: 'organization_lookup_failed' })
  if (!orgResult.data) return json(404, { error: 'organization_not_found' })

  // Actor authority from Planning-owned auth source. No PII is read or returned.
  const actor = parsed.value.actorUserId
  const [profileResult, rolesResult] = await Promise.all([
    admin.from('profiles').select('organization_id').eq('user_id', actor).maybeSingle(),
    admin.from('user_roles')
      .select('role, organization_id')
      .eq('user_id', actor)
      .eq('organization_id', org)
      .in('role', PLANNING_BRAIN_ACTOR_ROLES as unknown as string[]),
  ])
  if (profileResult.error || rolesResult.error) return json(503, { error: 'actor_lookup_failed' })
  const actorDecision = decidePlanningBrainActor({
    organizationId: org,
    profileOrganizationId: (profileResult.data as { organization_id?: string | null } | null)?.organization_id ?? null,
    roleRows: rolesResult.data ?? [],
  })
  if (!actorDecision.ok) return json(403, { error: actorDecision.error })

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
