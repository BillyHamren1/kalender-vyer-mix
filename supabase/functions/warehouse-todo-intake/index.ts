// Tar emot lager-to-dos från Brain (signerat anrop) och lägger dem som obemannade
// to-dos i lagrets kö (todos.calendar_scope='warehouse'). Idempotent på externalRef.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { PLANNING_BRAIN_NONCE_TTL_SECONDS, verifyPlanningBrainSignature } from '../_shared/planning-brain-read-contract.ts';
import { authorizeHubActor, logActorDenial } from '../_shared/hub-actor.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface IntakeRequest {
  schema: 'warehouse-todo-intake.v1';
  organizationId: string;
  actorUserId: string;
  externalRef: string;
  title: string;
  kind?: 'warehouse_task' | 'repair_care';
  notes?: string | null;
  scheduledDate?: string | null;
  bookingId?: string | null;
}

export function validIntake(b: any): b is IntakeRequest {
  return !!b && b.schema === 'warehouse-todo-intake.v1'
    && typeof b.organizationId === 'string' && UUID.test(b.organizationId)
    && typeof b.actorUserId === 'string' && UUID.test(b.actorUserId)
    && typeof b.externalRef === 'string' && b.externalRef.length >= 1 && b.externalRef.length <= 200
    && typeof b.title === 'string' && b.title.trim().length >= 1 && b.title.length <= 300
    && (b.kind === undefined || b.kind === 'warehouse_task' || b.kind === 'repair_care')
    && (b.notes == null || (typeof b.notes === 'string' && b.notes.length <= 4000))
    && (b.scheduledDate == null || (typeof b.scheduledDate === 'string' && DATE.test(b.scheduledDate)))
    && (b.bookingId == null || (typeof b.bookingId === 'string' && UUID.test(b.bookingId)));
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('PLANNING_BRAIN_READ_SIGNING_SECRET');
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !key) return json(503, { error: 'not_configured' });
  const rawBody = await request.text();
  if (rawBody.length > 20000) return json(413, { error: 'request_too_large' });
  if (!await verifyPlanningBrainSignature({ secret, rawBody, timestamp: request.headers.get('x-planning-timestamp'), nonce: request.headers.get('x-planning-nonce'), signature: request.headers.get('x-planning-signature') }))
    return json(401, { error: 'invalid_signature' });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid_request' }); }
  if (!validIntake(body)) return json(400, { error: 'invalid_request' });

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const nonce = await admin.rpc('consume_planning_brain_read_nonce', { _nonce: request.headers.get('x-planning-nonce'), _organization_id: body.organizationId, _ttl_seconds: PLANNING_BRAIN_NONCE_TTL_SECONDS });
  if (nonce.error) return json(503, { error: 'nonce_store_unavailable' });
  if (nonce.data !== true) return json(401, { error: 'nonce_replayed' });
  const actor = await authorizeHubActor(admin, { hubSubject: body.actorUserId, organizationId: body.organizationId, roles: ['admin', 'projekt', 'lager'] });
  if (!actor.ok) { logActorDenial('warehouse-todo-intake', actor.reason, body.organizationId); return json(actor.status, { error: actor.error }); }

  const org = body.organizationId;
  const existing = await admin.from('todos').select('id,planning_status').eq('organization_id', org)
    .eq('external_source', 'brain').eq('external_ref', body.externalRef).maybeSingle();
  if (existing.error) return json(503, { error: 'read_failed' });
  if (existing.data) return json(200, { schema: 'warehouse-todo-intake-receipt.v1', todoId: existing.data.id, created: false, planningStatus: existing.data.planning_status });

  const type = await admin.from('todo_types').select('id').eq('organization_id', org).eq('key', body.kind ?? 'warehouse_task').maybeSingle();
  if (type.error) return json(503, { error: 'read_failed' });
  if (!type.data) return json(409, { error: 'todo_type_missing' });

  if (body.bookingId) {
    const bk = await admin.from('bookings').select('id').eq('id', body.bookingId).eq('organization_id', org).maybeSingle();
    if (bk.error) return json(503, { error: 'read_failed' });
    if (!bk.data) return json(404, { error: 'booking_not_found' });
  }

  const ins = await admin.from('todos').insert({
    organization_id: org, title: body.title.trim(), type_id: type.data.id, calendar_scope: 'warehouse',
    planning_status: 'needs_planning', assigned_staff_id: null, scheduled_date: body.scheduledDate ?? null,
    internal_notes: body.notes?.trim() || null, booking_id: body.bookingId ?? null,
    external_source: 'brain', external_ref: body.externalRef, created_by: actor.localUserId,
  }).select('id').single();
  if (ins.error) {
    if ((ins.error as any).code === '23505') return json(409, { error: 'duplicate_external_ref' });
    return json(503, { error: 'write_failed' });
  }
  return json(201, { schema: 'warehouse-todo-intake-receipt.v1', todoId: ins.data.id, created: true, planningStatus: 'needs_planning' });
}

if (import.meta.main) Deno.serve(handleRequest);
