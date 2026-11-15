import { fetchIdentityContext, resolveWorkerStaff } from './canonicalWorker.ts';
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

export interface WorkerAssignmentSyncContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  authorization: string;
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  timeOrganizationId?: string;
}

/** Resolve only Time-verified Operations identity; preserve the existing signed projection. */
export async function handleWorkerAssignmentSync(ctx: WorkerAssignmentSyncContext): Promise<Response> {
  // Konfigurerad nyckel först, därefter värdpinnad publik nyckel, sist
  // arbetarens egen Time-token. Ingen route gate på valfri anon-nyckel.
  const gatewayKey = resolveGatewayKey(ctx.adapterUrl, ctx.anonKey)
    ?? ctx.anonKey ?? ctx.authorization.replace(/^Bearer\s+/i, '').trim();


  const resolution = await resolveWorkerStaff({
    fetchIdentityContext: () => fetchIdentityContext(ctx.adapterUrl, ctx.authorization, gatewayKey),
    getStaffById: async (id, organizationId) => {
      const { data, error } = await ctx.admin.from('staff_members')
        .select('id, organization_id, name, email, role, is_active, tags')
        .eq('id', id).eq('organization_id', organizationId).eq('is_active', true).limit(2);
      if (error) throw new Error('planning_read_failed');
      return data ?? [];
    },
    hasAccount: async (id, organizationId) => {
      const { data, error } = await ctx.admin.from('staff_accounts').select('staff_id, organization_id')
        .eq('staff_id', id).eq('organization_id', organizationId).limit(2);
      if (error) throw new Error('planning_read_failed');
      return data?.length === 1 && data[0].staff_id === id && data[0].organization_id === organizationId;
    },
  });
  if (!resolution.ok) return fail(resolution.status, resolution.code,
    'Time-identiteten eller aktuell Operations-appåtkomst kunde inte verifieras.', resolution.retryable);
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
