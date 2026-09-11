import { corsHeaders } from '../_shared/cors.ts';
import {
  buildWorkerProjection,
  callTimeAdapter,
  type Json,
  projectionWindow,
  resolveGatewayKey,
  text,
  timeProjectRoot,
} from './workerProjection.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const fail = (status: number, code: string, message: string, retryable = false) =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });

export interface WorkerAssignmentSyncContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  authorization: string;
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  timeOrganizationId?: string;
}

/**
 * Authenticate the Time personnel JWT at its owning Auth service, resolve the
 * same person by email in Planning, and push that worker's current Planning
 * assignments into Time. No Planning source row is modified.
 */
export async function handleWorkerAssignmentSync(ctx: WorkerAssignmentSyncContext): Promise<Response> {
  // Konfigurerad nyckel först, därefter värdpinnad publik nyckel, sist
  // arbetarens egen Time-token. Ingen route gate på valfri anon-nyckel.
  const gatewayKey = resolveGatewayKey(ctx.adapterUrl, ctx.anonKey)
    ?? ctx.anonKey ?? ctx.authorization.replace(/^Bearer\s+/i, '').trim();


  const userResponse = await fetch(`${timeProjectRoot(ctx.adapterUrl)}/auth/v1/user`, {
    headers: { authorization: ctx.authorization, apikey: gatewayKey },
  }).catch(() => null);
  if (!userResponse?.ok) return fail(401, 'unauthorized', 'Time-sessionen kunde inte verifieras.');

  const timeUser = await userResponse.json().catch(() => null) as Json | null;
  const email = text(timeUser?.email)?.toLocaleLowerCase('sv-SE');
  if (!email) return fail(401, 'unauthorized', 'Time-sessionen saknar verifierad e-postadress.');

  const { data: staffRows, error: staffError } = await ctx.admin
    .from('staff_members')
    .select('id, organization_id, name, email, role, is_active')
    .ilike('email', email)
    .eq('is_active', true)
    .limit(2);
  if (staffError) return fail(500, 'planning_read_failed', 'Planning-personalen kunde inte läsas.', true);
  if (!staffRows || staffRows.length !== 1) {
    return fail(404, 'personnel_not_mapped', 'E-postadressen matchar inte exakt en aktiv person i Planning.');
  }
  const staff = staffRows[0] as Json;
  const sourceOrganizationId = String(staff.organization_id);
  const timeOrganizationId = ctx.timeOrganizationId ?? sourceOrganizationId;
  if (timeOrganizationId !== sourceOrganizationId) {
    return fail(409, 'organization_mapping_mismatch', 'Planning- och Time-organisationen är inte samma kopplade organisation.');
  }

  const { from, to } = projectionWindow();
  const projection = await buildWorkerProjection({
    admin: ctx.admin,
    staff,
    organizationId: sourceOrganizationId,
    from,
    to,
  });
  if (!projection.ok) return fail(projection.status, projection.code, projection.message, projection.retryable);

  let upstream: Response;
  try {
    upstream = await callTimeAdapter({
      adapterUrl: ctx.adapterUrl,
      anonKey: gatewayKey,
      signingSeed: ctx.signingSeed,
      organizationId: timeOrganizationId,
      personnelId: String(staff.id),
      assignments: projection.assignments,
    });
  } catch (error) {
    return fail(503, 'upstream_unavailable', `Time-gränsen kunde inte nås: ${(error as Error)?.message ?? 'okänt fel'}`, true);
  }
  const upstreamBody = await upstream.json().catch(() => null) as Json | null;
  if (!upstream.ok) {
    return fail(upstream.status, text(upstreamBody?.code) ?? 'import_rejected', text(upstreamBody?.error) ?? `Time-gränsen svarade ${upstream.status}.`);
  }
  return json(200, {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: 'time-planning-adapter.v2',
    operation: 'worker.assignments.sync',
    generatedAt: new Date().toISOString(),
    data: {
      assignmentCount: projection.assignments.length,
      from: projection.from,
      to: projection.to,
      workOrder: projection.workOrder,
      receipt: upstreamBody?.data ?? null,
    },
  });
}
