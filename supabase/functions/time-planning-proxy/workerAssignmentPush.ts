/**
 * `worker.assignments.push` — Planning-initiated projection push.
 *
 * Called immediately after a Planning/Booking mutation that can change what a
 * worker sees (booking fields, times, location, products, files, tasks, team
 * membership, removal). For every affected worker we rebuild and send the
 * COMPLETE current projection through the same signed boundary the pull path
 * uses, so Time can move the worker head and keep its immutable history.
 *
 * Nothing here writes a Planning row and no Time table is written directly.
 */

import { corsHeaders } from '../_shared/cors.ts';
import {
  buildWorkerProjection,
  callTimeAdapter,
  type Json,
  projectionWindow,
  resolveGatewayKey,
  text,
} from './workerProjection.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const fail = (status: number, code: string, message: string, retryable = false) =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never fan out unbounded from one mutation. */
export const MAX_WORKERS_PER_PUSH = 40;

export const uuidList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter((v) => UUID_LIKE.test(v)))];
};

export interface WorkerPushRequest {
  readonly bookingIds: string[];
  readonly staffIds: string[];
  readonly reason: string;
}

export const parseWorkerPushRequest = (body: Json): WorkerPushRequest => ({
  bookingIds: uuidList(body.bookingIds ?? (body.bookingId ? [body.bookingId] : [])),
  staffIds: uuidList(body.staffIds ?? (body.staffId ? [body.staffId] : [])),
  reason: text(body.reason) ?? 'planning_mutation',
});

export interface AffectedWorkersOk {
  readonly ok: true;
  readonly staffIds: string[];
  readonly message?: undefined;
}

export interface AffectedWorkersFailed {
  readonly ok: false;
  readonly staffIds?: undefined;
  readonly message: string;
}

/**
 * Resolve every worker whose projection can be affected by the mutation:
 * explicit staff ids + everyone assigned to a team/date that the touched
 * bookings occupy in the calendar.
 */
export async function resolveAffectedWorkerIds(input: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  organizationId: string;
  bookingIds: readonly string[];
  staffIds: readonly string[];
}): Promise<AffectedWorkersOk | AffectedWorkersFailed> {

  const ids = new Set<string>(input.staffIds);
  if (input.bookingIds.length) {
    const { data: events, error: eventError } = await input.admin
      .from('calendar_events')
      .select('resource_id, source_date')
      .eq('organization_id', input.organizationId)
      .in('booking_id', [...input.bookingIds]);
    if (eventError) return { ok: false, message: 'Planning-kalendern kunde inte läsas.' };
    const rows = (events ?? []) as Json[];
    const teamIds = [...new Set(rows.map((row) => text(row.resource_id)).filter(Boolean))] as string[];
    const dates = [...new Set(rows.map((row) => text(row.source_date)).filter(Boolean))] as string[];
    if (teamIds.length && dates.length) {
      const pairs = new Set(rows.map((row) => `${row.source_date}:${row.resource_id}`));
      const { data: assignments, error: assignmentError } = await input.admin
        .from('staff_assignments')
        .select('staff_id, team_id, assignment_date')
        .eq('organization_id', input.organizationId)
        .in('team_id', teamIds)
        .in('assignment_date', dates);
      if (assignmentError) return { ok: false, message: 'Planning-tilldelningarna kunde inte läsas.' };
      for (const row of (assignments ?? []) as Json[]) {
        if (pairs.has(`${row.assignment_date}:${row.team_id}`)) ids.add(String(row.staff_id));
      }
    }
  }
  return { ok: true, staffIds: [...ids].slice(0, MAX_WORKERS_PER_PUSH) };
}

export interface WorkerPushContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  organizationId: string;
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  body: Json;
}

export async function handleWorkerAssignmentPush(ctx: WorkerPushContext): Promise<Response> {
  const gatewayKey = resolveGatewayKey(ctx.adapterUrl, ctx.anonKey);
  if (!gatewayKey) return fail(503, 'not_configured', 'Time Auth-nyckeln saknas för uppdragspushen.', true);

  const request = parseWorkerPushRequest(ctx.body);
  if (!request.bookingIds.length && !request.staffIds.length) {
    return fail(400, 'invalid_request', 'Push kräver minst ett bookingId eller staffId.');
  }

  const resolved = await resolveAffectedWorkerIds({
    admin: ctx.admin,
    organizationId: ctx.organizationId,
    bookingIds: request.bookingIds,
    staffIds: request.staffIds,
  });
  if (!resolved.ok) return fail(500, 'planning_read_failed', resolved.message, true);

  if (!resolved.staffIds.length) {
    return json(200, {
      schema: 'time-planning-boundary-response.v1',
      adapterVersion: 'time-planning-adapter.v2',
      operation: 'worker.assignments.push',
      generatedAt: new Date().toISOString(),
      data: { reason: request.reason, workers: [], pushed: 0, skipped: 0 },
    });
  }

  const { data: staffRows, error: staffError } = await ctx.admin
    .from('staff_members')
    .select('id, organization_id, name, email, role, is_active')
    .eq('organization_id', ctx.organizationId)
    .in('id', resolved.staffIds);
  if (staffError) return fail(500, 'planning_read_failed', 'Planning-personalen kunde inte läsas.', true);

  const { from, to } = projectionWindow();
  const workers: Json[] = [];
  let pushed = 0;

  for (const row of (staffRows ?? []) as Json[]) {
    const staffId = String(row.id);
    if (row.is_active === false) {
      workers.push({ staffId, status: 'skipped', code: 'inactive_personnel' });
      continue;
    }
    const projection = await buildWorkerProjection({
      admin: ctx.admin,
      staff: row,
      organizationId: ctx.organizationId,
      from,
      to,
    });
    if (!projection.ok) {
      workers.push({ staffId, status: 'failed', code: projection.code });
      continue;
    }
    try {
      const upstream = await callTimeAdapter({
        adapterUrl: ctx.adapterUrl,
        anonKey: gatewayKey,
        signingSeed: ctx.signingSeed,
        organizationId: ctx.organizationId,
        personnelId: staffId,
        assignments: projection.assignments,
      });
      const upstreamBody = await upstream.json().catch(() => null) as Json | null;
      if (!upstream.ok) {
        workers.push({
          staffId,
          status: 'failed',
          code: text(upstreamBody?.code) ?? `upstream_${upstream.status}`,
          assignmentCount: projection.assignments.length,
        });
        continue;
      }
      pushed += 1;
      workers.push({ staffId, status: 'synced', assignmentCount: projection.assignments.length });
    } catch (error) {
      workers.push({ staffId, status: 'failed', code: 'upstream_unavailable', error: (error as Error)?.message ?? 'okänt fel' });
    }
  }

  return json(200, {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: 'time-planning-adapter.v2',
    operation: 'worker.assignments.push',
    generatedAt: new Date().toISOString(),
    data: {
      reason: request.reason,
      from,
      to,
      pushed,
      skipped: workers.length - pushed,
      workers,
    },
  });
}
