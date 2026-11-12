import { corsHeaders } from '../../supabase/functions/_shared/cors.ts';
import { IDENTITY_CONTEXT_REQUEST, resolveWorkerStaff, type Resolution, type StaffRow } from './canonicalWorker.ts';
import {
  buildWorkerProjection,
  callTimeAdapter,
  type Json,
  projectionWindow,
  resolveGatewayKey,
  text,
  timeProjectRoot,
} from '../../supabase/functions/time-planning-proxy/workerProjection.ts';

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
 * Resolve the worker via Time's verified identity-context (exact Operations
 * staff id + organization for migrated accounts; email only for unlinked legacy), and push that worker's current Planning
 * assignments into Time. No Planning source row is modified.
 */
export async function handleWorkerAssignmentSync(ctx: WorkerAssignmentSyncContext): Promise<Response> {
  // Konfigurerad nyckel först, därefter värdpinnad publik nyckel, sist
  // arbetarens egen Time-token. Ingen route gate på valfri anon-nyckel.
  const gatewayKey = resolveGatewayKey(ctx.adapterUrl, ctx.anonKey)
    ?? ctx.anonKey ?? ctx.authorization.replace(/^Bearer\s+/i, '').trim();


  const timeRoot = timeProjectRoot(ctx.adapterUrl);
  const STAFF_COLUMNS = 'id, organization_id, name, email, role, is_active';
  const resolution = await resolveWorkerStaff({
    // Time verifies the JWT server-side and checks current role/profile; scope never comes from the client.
    fetchIdentityContext: async () => {
      const r = await fetch(`${timeRoot}/functions/v1/identity-context`, {
        method: 'POST',
        headers: { authorization: ctx.authorization, apikey: gatewayKey, 'content-type': 'application/json' },
        body: JSON.stringify(IDENTITY_CONTEXT_REQUEST),
      }).catch(() => null);
      if (!r) return null;
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    getStaffById: async (id) => {
      const { data, error } = await ctx.admin.from('staff_members').select(STAFF_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw new Error('planning_read_failed');
      return data as StaffRow | null;
    },
    // Only for Time profiles WITHOUT an Operations link (pre-migration accounts).
    legacyByEmail: async (): Promise<Resolution> => {
      const userResponse = await fetch(`${timeRoot}/auth/v1/user`, {
        headers: { authorization: ctx.authorization, apikey: gatewayKey },
      }).catch(() => null);
      if (!userResponse?.ok) return { ok: false, status: 401, code: 'unauthorized', retryable: false };
      const timeUser = await userResponse.json().catch(() => null) as Json | null;
      const email = text(timeUser?.email)?.toLocaleLowerCase('sv-SE');
      if (!email) return { ok: false, status: 401, code: 'unauthorized', retryable: false };
      const { data: staffRows, error } = await ctx.admin.from('staff_members').select(STAFF_COLUMNS)
        .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)).eq('is_active', true).limit(2);
      if (error) return { ok: false, status: 500, code: 'planning_read_failed', retryable: true };
      if (!staffRows || staffRows.length !== 1) return { ok: false, status: 404, code: 'personnel_not_mapped', retryable: false };
      return { ok: true, staff: staffRows[0] as StaffRow, via: 'legacy_email' };
    },
  }).catch((): Resolution => ({ ok: false, status: 500, code: 'planning_read_failed', retryable: true }));
  if (!resolution.ok) return fail(resolution.status, resolution.code, 'Time-personalen kunde inte kopplas till Operations.', resolution.retryable);

  const staff = resolution.staff as unknown as Json;
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
      warehouseContext: projection.warehouseContext,
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
      warehouseContextStatus: projection.warehouseContext ? 'synced' : 'unavailable',
      receipt: upstreamBody?.data ?? null,
    },
  });
}
