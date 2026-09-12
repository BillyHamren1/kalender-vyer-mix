/**
 * planning-brain-read.v1 — READ-ONLY Planning projection for EventFlow Agent Core (BRAIN).
 *
 * Source-of-truth boundary (canonical EventFlow ownership):
 *  - Planning owns: operational planning days, phases, team/resource assignments,
 *    project planning state. These are exposed as facts.
 *  - Booking owns: commercial order/customer/price. Exposed ONLY as opaque references.
 *  - WMS/Bundle owns: inventory, reservation, packlist, scan/return. Not exposed here.
 *  - Time owns: hours, GPS evidence, expenses, approval. Not exposed here.
 *
 * The contract never fabricates Planning truth: unknown/foreign facts are either
 * omitted or returned as opaque reference ids. No customer names, addresses,
 * contacts, notes, coordinates or personnel PII are projected.
 *
 * Auth is an explicit server-to-server boundary (shared-secret HMAC), never a
 * user session cookie that BRAIN cannot own.
 */

export const PLANNING_BRAIN_READ_REQUEST_SCHEMA = 'planning-brain-read-request.v1' as const
export const PLANNING_BRAIN_READ_SCHEMA = 'planning-brain-read.v1' as const

export const PLANNING_BRAIN_SIGNATURE_MAX_SKEW_MS = 300_000
export const PLANNING_BRAIN_MAX_RANGE_DAYS = 31

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/
const SIGNATURE_RE = /^v1=[0-9a-f]{64}$/i

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const uuid = (value: unknown) =>
  typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null

const isoDate = (value: unknown) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10) === value ? value : null
}

const nullableText = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null

const nullableIso = (value: unknown) => {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

export const dayDifference = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)

/* -------------------------------------------------------------------------- */
/* Signature (server-to-server only)                                          */
/* -------------------------------------------------------------------------- */

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const planningBrainSignatureMessage = (timestamp: string, nonce: string, rawBody: string) =>
  `${timestamp}.${nonce}.${rawBody}`

export async function signPlanningBrainRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): Promise<string> {
  return `v1=${await hmacSha256Hex(secret, planningBrainSignatureMessage(timestamp, nonce, rawBody))}`
}

export async function verifyPlanningBrainSignature(input: {
  readonly secret: string
  readonly rawBody: string
  readonly timestamp: string | null
  readonly nonce: string | null
  readonly signature: string | null
  readonly nowMs?: number
}): Promise<boolean> {
  if (!input.secret || !input.timestamp || !input.nonce || !input.signature) return false
  if (!/^\d{13}$/.test(input.timestamp)) return false
  if (!NONCE_RE.test(input.nonce) || !SIGNATURE_RE.test(input.signature)) return false
  const sentAt = Number(input.timestamp)
  if (!Number.isSafeInteger(sentAt)) return false
  if (Math.abs((input.nowMs ?? Date.now()) - sentAt) > PLANNING_BRAIN_SIGNATURE_MAX_SKEW_MS) return false
  const expected = await signPlanningBrainRequest(input.secret, input.timestamp, input.nonce, input.rawBody)
  if (expected.length !== input.signature.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index)
  }
  return difference === 0
}

/* -------------------------------------------------------------------------- */
/* Request                                                                     */
/* -------------------------------------------------------------------------- */

export interface PlanningBrainReadRequest {
  readonly schema: typeof PLANNING_BRAIN_READ_REQUEST_SCHEMA
  readonly organizationId: string
  readonly from: string
  readonly to: string
}

export type ParsePlanningBrainReadRequest =
  | { readonly ok: true; readonly value: PlanningBrainReadRequest }
  | { readonly ok: false; readonly error: string }

export function parsePlanningBrainReadRequest(input: unknown): ParsePlanningBrainReadRequest {
  if (!isObject(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set(['schema', 'organizationId', 'from', 'to'])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== PLANNING_BRAIN_READ_REQUEST_SCHEMA) return { ok: false, error: 'unsupported_schema' }
  const organizationId = uuid(input.organizationId)
  if (!organizationId) return { ok: false, error: 'invalid_organization_id' }
  const from = isoDate(input.from)
  const to = isoDate(input.to)
  if (!from || !to) return { ok: false, error: 'invalid_date_range' }
  const span = dayDifference(from, to)
  if (span < 0) return { ok: false, error: 'invalid_date_range' }
  if (span + 1 > PLANNING_BRAIN_MAX_RANGE_DAYS) return { ok: false, error: 'range_too_large' }
  return { ok: true, value: { schema: PLANNING_BRAIN_READ_REQUEST_SCHEMA, organizationId, from, to } }
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                  */
/* -------------------------------------------------------------------------- */

export interface PlanningBrainSourceRows {
  readonly projects: readonly Record<string, unknown>[]
  readonly calendarEvents: readonly Record<string, unknown>[]
  readonly assignments: readonly Record<string, unknown>[]
}

/** Planning-owned phase vocabulary. Anything else stays explicitly unknown. */
const PHASE_BY_EVENT_TYPE: Record<string, 'rig' | 'event' | 'derig'> = {
  rig: 'rig',
  rigg: 'rig',
  event: 'event',
  rigdown: 'derig',
  derig: 'derig',
  nedrigg: 'derig',
}

export const planningPhase = (eventType: unknown): 'rig' | 'event' | 'derig' | null => {
  if (typeof eventType !== 'string') return null
  return PHASE_BY_EVENT_TYPE[eventType.trim().toLowerCase()] ?? null
}

export interface PlanningBrainProjection {
  readonly schema: typeof PLANNING_BRAIN_READ_SCHEMA
  readonly generatedAt: string
  readonly canonicalIdentity: { readonly organizationId: string }
  readonly window: { readonly from: string; readonly to: string }
  readonly ownership: {
    readonly planningOwned: readonly string[]
    readonly opaqueReferences: readonly string[]
  }
  readonly projects: readonly {
    readonly projectId: string
    readonly planningStatus: string | null
    readonly status: string | null
    readonly isInternal: boolean
    readonly bookingRef: string | null
    readonly rigDate: string | null
    readonly eventDate: string | null
    readonly derigDate: string | null
  }[]
  readonly planningDays: readonly {
    readonly calendarEventId: string
    readonly date: string | null
    readonly phase: 'rig' | 'event' | 'derig' | null
    readonly rawEventType: string | null
    readonly teamResourceId: string | null
    readonly startsAt: string | null
    readonly endsAt: string | null
    readonly timesLocked: boolean
    readonly bookingRef: string | null
  }[]
  readonly teamAssignments: readonly {
    readonly assignmentId: string
    readonly date: string | null
    readonly teamResourceId: string | null
    readonly staffRef: string | null
    readonly role: string | null
    readonly bookingRef: string | null
  }[]
  readonly counts: {
    readonly projects: number
    readonly planningDays: number
    readonly teamAssignments: number
  }
}

/**
 * Pure builder. Drops every row that cannot be proven to belong to the requested
 * organization — cross-tenant rows are never projected, never repaired.
 */
export function buildPlanningBrainProjection(input: {
  readonly request: PlanningBrainReadRequest
  readonly rows: PlanningBrainSourceRows
  readonly generatedAt: string
}): PlanningBrainProjection {
  const org = input.request.organizationId
  const sameOrg = (row: Record<string, unknown>) => uuid(row.organization_id) === org

  const projects = input.rows.projects.filter(sameOrg).flatMap((row) => {
    const projectId = uuid(row.id)
    if (!projectId) return []
    return [{
      projectId,
      planningStatus: nullableText(row.planning_status, 64),
      status: nullableText(row.status, 64),
      isInternal: row.is_internal === true,
      bookingRef: nullableText(row.booking_id, 128),
      rigDate: isoDate(row.rigdaydate),
      eventDate: isoDate(row.eventdate),
      derigDate: isoDate(row.rigdowndate),
    }]
  }).sort((a, b) => a.projectId.localeCompare(b.projectId))

  const planningDays = input.rows.calendarEvents.filter(sameOrg).flatMap((row) => {
    const calendarEventId = uuid(row.id)
    if (!calendarEventId) return []
    return [{
      calendarEventId,
      date: isoDate(row.source_date),
      phase: planningPhase(row.event_type),
      rawEventType: nullableText(row.event_type, 64),
      teamResourceId: nullableText(row.resource_id, 64),
      startsAt: nullableIso(row.start_time),
      endsAt: nullableIso(row.end_time),
      timesLocked: row.times_locked === true,
      bookingRef: nullableText(row.booking_id, 128),
    }]
  }).sort((a, b) => a.calendarEventId.localeCompare(b.calendarEventId))

  const teamAssignments = input.rows.assignments.filter(sameOrg).flatMap((row) => {
    const assignmentId = uuid(row.id)
    if (!assignmentId) return []
    return [{
      assignmentId,
      date: isoDate(row.assignment_date),
      teamResourceId: nullableText(row.team_id, 64),
      staffRef: nullableText(row.staff_id, 128),
      role: nullableText(row.role, 64),
      bookingRef: nullableText(row.booking_id, 128),
    }]
  }).sort((a, b) => a.assignmentId.localeCompare(b.assignmentId))

  return {
    schema: PLANNING_BRAIN_READ_SCHEMA,
    generatedAt: new Date(input.generatedAt).toISOString(),
    canonicalIdentity: { organizationId: org },
    window: { from: input.request.from, to: input.request.to },
    ownership: {
      planningOwned: ['projects', 'planningDays', 'teamAssignments'],
      opaqueReferences: ['bookingRef:booking', 'staffRef:planning-staff-id', 'teamResourceId:planning-resource'],
    },
    projects,
    planningDays,
    teamAssignments,
    counts: {
      projects: projects.length,
      planningDays: planningDays.length,
      teamAssignments: teamAssignments.length,
    },
  }
}

/** Fields that must never leave Planning through this seam. */
export const PLANNING_BRAIN_FORBIDDEN_FIELDS = [
  'client',
  'contact_name',
  'contact_email',
  'contact_phone',
  'deliveryaddress',
  'delivery_address',
  'delivery_city',
  'delivery_postal_code',
  'delivery_latitude',
  'delivery_longitude',
  'internalnotes',
  'title',
  'name',
  'email',
  'phone',
] as const
