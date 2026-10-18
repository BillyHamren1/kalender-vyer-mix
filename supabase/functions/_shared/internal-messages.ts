import { verifyPlanningBrainSignature } from './planning-brain-read-contract.ts'
import { authorizeHubActor, logActorDenial } from './hub-actor.ts'
/** Every existing app_role counts as org membership for Messages (no new grants). */
export const MESSAGE_MEMBER_ROLES = ['admin', 'forsaljning', 'projekt', 'lager'] as const
/** Shared messaging identity, cursor and retry rules. No authentication is inferred from input. */
export const MESSAGE_SCHEMA = 'eventflow.internal-messages.v1'
export const MESSAGE_ACTIONS = ['get_contacts', 'get_dm_inbox_grouped', 'get_dm_thread', 'get_unread_dm_count', 'send_direct_message', 'mark_dm_read', 'archive_dm', 'get_job_messages', 'send_job_message', 'mark_job_read', 'register_push_token', 'unregister_push_token'] as const
export const safeMessageId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
export const validRequestId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export function messageCursor(row: { created_at: string; id: string }): string {
  return JSON.stringify({ at: row.created_at, id: row.id })
}
export function parseMessageCursor(value: unknown): { at: string; id?: string } | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 300) throw new Error('invalid_cursor')
  let at = value; let id: string | undefined
  if (value.startsWith('{')) {
    const parsed = JSON.parse(value)
    at = parsed.at; id = parsed.id
    if (!safeMessageId(id)) throw new Error('invalid_cursor')
  }
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) throw new Error('invalid_cursor')
  return { at, ...(id ? { id } : {}) }
}
export function messagePage<T extends { id: string; created_at: string }>(rows: T[], size: number) {
  const page = rows.slice(0, size)
  return { messages: page.slice().reverse(), has_more: rows.length > size, next_cursor: page.length ? messageCursor(page[page.length - 1]) : null }
}
export function sameMessageRequest(existing: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return ['organization_id', 'sender_id', 'recipient_id', 'content', 'file_url', 'file_name', 'file_type', 'booking_id'].every(key => (existing[key] ?? null) === (expected[key] ?? null))
}

/** Signed cross-app authorization. Input identity is trusted only after HMAC + nonce + both membership checks. */
export async function authorizeInternalMessages(input: {
  body: Record<string, any>; rawBody: string; headers: Headers; method: string; secret: string; supabase: any;
}): Promise<{ status: number; error: string } | { staffId: string; organizationId: string; userId: string }> {
  const { body, rawBody, headers, method, secret, supabase } = input
  const { action, data } = body
  const deny = (status: number, error: string) => ({ status, error })
  if (method !== 'POST' || rawBody.length > 24000 || body.schema !== MESSAGE_SCHEMA || body.token ||
      Object.keys(body).some(k => !['schema', 'actorUserId', 'organizationId', 'action', 'data'].includes(k)) ||
      !MESSAGE_ACTIONS.includes(action) || !/^[0-9a-f-]{36}$/i.test(body.actorUserId || '') || !/^[0-9a-f-]{36}$/i.test(body.organizationId || '')) return deny(400, 'invalid_messaging_request')
  if (secret.length < 32) return deny(503, 'messaging_not_configured')
  if (!await verifyPlanningBrainSignature({ secret, rawBody: MESSAGE_SCHEMA + '\n' + rawBody,
    timestamp: headers.get('x-internal-messages-timestamp'), nonce: headers.get('x-internal-messages-nonce'),
    signature: headers.get('x-internal-messages-signature') })) return deny(401, 'invalid_signature')
  const nonce = await supabase.rpc('consume_planning_brain_read_nonce', {
    _nonce: headers.get('x-internal-messages-nonce'), _organization_id: body.organizationId,
  })
  if (nonce.error) return deny(503, 'nonce_store_unavailable')
  if (nonce.data !== true) return deny(401, 'nonce_replayed')
  // Request principal = canonical HUB subject. Local principal only via protected
  // resolve_hub_actor_v1; membership = any existing per-org role (unchanged semantics),
  // never last-used profiles.organization_id or user-editable metadata.
  const actor = await authorizeHubActor(supabase, { hubSubject: body.actorUserId, organizationId: body.organizationId, roles: MESSAGE_MEMBER_ROLES })
  if (actor.ok === false) { logActorDenial('internal-messages', actor.reason, body.organizationId); return deny(actor.status, actor.error) }
  const localUserId = actor.localUserId
  const staffRows = await supabase.from('staff_members').select('id, is_active').eq('user_id', localUserId).eq('organization_id', body.organizationId).limit(2)
  if (staffRows.error) return deny(503, 'actor_lookup_failed')
  if (!Array.isArray(staffRows.data) || staffRows.data.length > 1 || staffRows.data.some((s: { is_active: boolean }) => !s.is_active)) {
    logActorDenial('internal-messages', staffRows.data?.length > 1 ? 'staff_ambiguous' : 'staff_inactive', body.organizationId)
    return deny(403, 'actor_not_authorized')
  }
  if (action === 'send_direct_message' && (!validRequestId(data?.request_id) || Object.keys(data || {}).some(k => !['recipient_id', 'content', 'request_id'].includes(k)))) return deny(400, 'invalid_send_request')
  if (['get_job_messages', 'send_job_message', 'mark_job_read'].includes(action)) {
    const allowedKeys = action === 'get_job_messages' ? ['booking_id', 'before', 'limit']
      : action === 'send_job_message' ? ['booking_id', 'content'] : ['booking_id']
    if (!data || typeof data !== 'object' || Array.isArray(data) || !safeMessageId(data.booking_id) ||
        Object.keys(data).some(key => !allowedKeys.includes(key))) return deny(400, 'invalid_job_request')
    if (action === 'send_job_message' && (typeof data.content !== 'string' || !data.content.trim() || data.content.length > 10000)) return deny(400, 'invalid_job_request')
    if (action === 'get_job_messages' && (
      (data.limit !== undefined && (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 100)) ||
      (data.before !== undefined && (typeof data.before !== 'string' || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(data.before) || !Number.isFinite(Date.parse(data.before))))
    )) return deny(400, 'invalid_job_request')
    // Verify the target even for planners: the legacy access gate may grant a
    // planner before looking up the booking. Never permit a cross-tenant target.
    const booking = await supabase.from('bookings').select('id').eq('id', data.booking_id).eq('organization_id', body.organizationId).maybeSingle()
    if (booking.error) return deny(503, 'booking_lookup_failed')
    if (!booking.data) return deny(403, 'job_not_authorized')
  }
  return { staffId: staffRows.data[0]?.id || localUserId, organizationId: body.organizationId, userId: localUserId }
}
