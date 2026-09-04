/**
 * `lager.contextImport` — versioned `planning-lager-context.v1` export from
 * Planning into Time's `work-context-import` boundary, executed entirely
 * server-side through the SAME seed-derived ES256 signer as the adapter proxy.
 *
 *  - Planning source rows: SELECT only (no Planning write).
 *  - Time side: additive `work-context.v1` contextTargets projection with
 *    ZERO assignments; importing can never create scheduled work or time.
 *  - Tenancy fails closed via the explicit source-org → Time-org binding.
 *  - Idempotent: content-derived projectionId + pinned generatedAt ⇒ replay
 *    of unchanged content yields the same import id ('duplicate' receipt).
 *
 * No token, seed or key material is ever returned or logged.
 */

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { base64url, deriveSigningKeyFromSeed } from '../_shared/timeServiceProof.ts';
import { buildLagerContextProjection } from '../_shared/time-v2/lagerProjection.ts';
import { readLagerProjectionInputs } from '../_shared/time-v2/lagerContextReads.ts';
import {
  buildLagerExportDocument,
  buildLagerMachineJwtClaims,
  buildLagerWorkContextProjection,
  LagerExportError,
  resolveLagerExportBinding,
} from '../_shared/time-v2/lagerContextExport.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, code: string, message: string, retryable = false) =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const encoder = new TextEncoder();

export interface LagerContextImportContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  organizationId: string;
  body: Record<string, unknown>;
  adapterUrl: string;
  anonKey: string | undefined;
  signingSeed: string;
}

export async function handleLagerContextImport(ctx: LagerContextImportContext): Promise<Response> {
  const { body } = ctx;

  const from = body.from;
  const to = body.to;
  if (!isDate(from) || !isDate(to) || from > to) {
    return fail(400, 'invalid_range', 'from/to måste vara YYYY-MM-DD med from <= to.');
  }
  const planningSha = typeof body.planningSha === 'string' ? body.planningSha : '';
  if (!/^[0-9a-f]{40}$/.test(planningSha)) {
    return fail(400, 'invalid_planning_sha', 'planningSha måste vara exakt 40 hex-tecken (Planning-commit).');
  }
  const staffIds = Array.isArray(body.staffIds)
    ? (body.staffIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : null;
  const generatedAt = typeof body.generatedAt === 'string' ? body.generatedAt : new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) {
    return fail(400, 'invalid_generated_at', 'generatedAt måste vara en ISO-8601-tidsstämpel.');
  }
  const dryRun = body.dryRun === true;

  // Tenant is resolved server-side; a client-supplied organizationId is ignored.
  const organizationId = ctx.organizationId;

  let rows;
  try {
    rows = await readLagerProjectionInputs(ctx.admin, organizationId, from, to);
  } catch (e) {
    console.error('[lager.contextImport] read failed', (e as Error)?.message);
    return fail(500, 'read_failed', 'Kunde inte läsa Planning-data för Lager-kontexten.');
  }

  const projection = buildLagerContextProjection({
    organizationId,
    from,
    to,
    staffIds,
    ...rows,
  });

  try {
    // Tenancy FIRST: without an explicit binding nothing is even built.
    const binding = resolveLagerExportBinding(projection.organizationId);

    const internalProject = projection.location?.internalProjectId
      ? (rows.internalProjects as Array<{ id: string; name?: string | null }>)
          .find((p) => p.id === projection.location!.internalProjectId)
      : undefined;

    const document = buildLagerExportDocument({
      projection,
      projectLabel: (internalProject?.name ?? '').trim() || 'Lager',
      planningSha,
      generatedAt,
    });

    const { projection: workContext, projectionHash, digest } =
      await buildLagerWorkContextProjection(document, binding);

    const summary = {
      sourceOrganizationId: document.sourceOrganizationId,
      timeOrganizationId: binding.timeOrganizationId,
      organizationExternalId: binding.organizationExternalId,
      projectionId: workContext.projectionId,
      projectionHash,
      digest,
      generatedAt: document.generatedAt,
      planningSha: document.planningSha,
      permittedTargetCount: document.permittedTargets.length,
      contextTargetCount: workContext.contextTargets.length,
      assignmentCount: 0,
    };

    if (dryRun) {
      return json(200, {
        schema: 'time-planning-boundary-response.v1',
        operation: 'lager.contextImport',
        dryRun: true,
        generatedAt: new Date().toISOString(),
        data: { ...summary, document, workContext },
      });
    }

    // ONLY signing path: the same seed-derived, non-extractable ES256 key.
    const { key, keyId } = await deriveSigningKeyFromSeed(ctx.signingSeed);
    const header = { alg: 'ES256', typ: 'JWT', kid: keyId };
    const claims = buildLagerMachineJwtClaims({ projectionHash });
    const signingInput =
      `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(signingInput),
    );
    const token = `${signingInput}.${base64url(signature)}`;

    let upstream: Response;
    try {
      upstream = await fetch(`${ctx.adapterUrl.replace(/\/+$/, '')}/work-context-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(ctx.anonKey ? { apikey: ctx.anonKey } : {}),
        },
        body: JSON.stringify(workContext),
      });
    } catch (e) {
      return fail(503, 'upstream_unavailable', `Time-importgränsen gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`, true);
    }

    const raw = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    // Log NOTHING secret: status + projection identity only.
    console.log('[lager.contextImport] upstream', {
      status: upstream.status,
      projectionId: workContext.projectionId,
      contextTargetCount: workContext.contextTargets.length,
      body: JSON.stringify(raw)?.slice(0, 300),
    });

    if (upstream.status === 401) {
      return fail(
        502,
        'registration_not_bound',
        'Time avvisade maskinsigneringen (401): Plannings seed-härledda kid är inte registrerad för work-context-registreringen '
        + `(iss/aud/sub ${claims.iss} / ${claims.aud} / ${claims.sub}). Time-sidan måste uppdatera `
        + 'work_context_source_registrations.credential_key_id + verification_jwk till Plannings nya publika nyckel.',
      );
    }
    if (!upstream.ok) {
      return json(upstream.status, {
        schema: 'time-planning-boundary-error.v1',
        code: typeof raw?.code === 'string' ? raw.code : 'import_rejected',
        retryable: false,
        error: typeof raw?.error === 'string' ? raw.error : `Time-importgränsen svarade ${upstream.status}.`,
        data: summary,
      });
    }

    return json(200, {
      schema: 'time-planning-boundary-response.v1',
      operation: 'lager.contextImport',
      generatedAt: new Date().toISOString(),
      data: { ...summary, receipt: raw },
    });
  } catch (e) {
    if (e instanceof LagerExportError) {
      const status = e.code === 'no_binding' || e.code === 'conflicting_binding' || e.code === 'no_lager_context'
        || e.code === 'no_worker_grants' || e.code === 'too_many_grants'
        ? 422
        : 400;
      return fail(status, e.code, e.message);
    }
    console.error('[lager.contextImport] failed', (e as Error)?.message);
    return fail(500, 'export_failed', 'Lager-kontextexporten misslyckades oväntat.');
  }
}
