/**
 * Planning → Time same-origin boundary proxy.
 *
 * The browser never talks to Time directly and never receives a service
 * credential. This function:
 *  1. verifies the Planning JWT,
 *  2. requires Planning authority (has_planning_access),
 *  3. resolves the tenant server-side,
 *  4. calls Time's real deployed boundary `time-planning-adapter`
 *     (contract `time-planning-boundary.v1`, adapter `time-planning-adapter.v2`)
 *     with the server-held Time system credential.
 *
 * Planning source records are never written here and no payroll/project output
 * is published anywhere.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { assertPlanningAccess } from '../_shared/planningAccess.ts';
import {
  buildServiceProofClaims,
  deriveSigningKeyFromSeed,
  SERVICE_PROOF_HEADER,
  sha256Hex,
  signServiceProofJwt,
} from '../_shared/timeServiceProof.ts';
import { handleLagerContextImport } from './lagerImport.ts';



const TIME_BOUNDARY_SCHEMA = 'time-planning-boundary.v1';
const TIME_ADAPTER_VERSION = 'time-planning-adapter.v2';

/** Exactly the operations Time's deployed manifest exposes. */
const ALLOWED_OPERATIONS = new Set([
  'manifest',
  'status',
  'personnel.list',
  'personnel.accounts',
  'personnel.detail',
  'personnel.activationSupport',
  'days.list',
  'days.queue',
  'days.detail',
  'days.evidence',
  'preview.payroll',
  'preview.project',
  'personnel.setAppAccess',
  'review.requestCorrection',
  'attest.payroll',
  'attest.project',
  'activation.issue',
  'activation.reissue',
  'activation.list',
  'activation.revoke',
]);

const FORWARDABLE = [
  'personnelId',
  'submissionId',
  'limit',
  'reason',
  'decision',
  'domain',
  'state',
  'roles',
  'channel',
  'ttlSeconds',
  'ticketId',
  'idempotencyKey',
];

/** A ticket/secret/token must never travel back to the browser. */
const SECRET_KEYS = [
  'oneTimeSecret', 'one_time_secret', 'secret', 'ticketSecret', 'token', 'accessToken',
  'refreshToken', 'password', 'session', 'claimUrl', 'magicLink', 'actionLink',
];

const scrub = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.includes(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, code: string, message: string, retryable = false) =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Method not allowed');

  const authorization = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return fail(401, 'unauthorized', 'Authentication required');
  }


  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return fail(503, 'service_not_configured', 'Planning runtime is not configured', true);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(authorization.slice(7));
  if (userError || !userData?.user) return fail(401, 'unauthorized', 'Invalid session');

  const access = await assertPlanningAccess(admin as unknown as never, userData.user.id);
  if (!access.ok) return fail(access.status, access.error, access.message);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_json', 'Invalid JSON body');
  }

  const operation = typeof body.operation === 'string' ? body.operation : '';

  // ONLY signing path: ES256 key derived at runtime from the secret seed.
  // The legacy TIME_ADAPTER_SIGNING_PRIVATE_JWK secret is intentionally never
  // read anywhere in this function — the previously exposed private JWK can
  // never become active again, even if the secret object still exists.
  const signingSeed = Deno.env.get('TIME_ADAPTER_SIGNING_SEED');

  // Versioned planning-lager-context.v1 export → Time work-context-import.
  // Separate boundary from the adapter operations: same auth, same tenant
  // resolution, same seed-derived signer — handled in ./lagerImport.ts.
  if (operation === 'lager.contextImport') {
    const importAdapterUrl = Deno.env.get('TIME_ADAPTER_URL');
    if (!importAdapterUrl || !signingSeed) {
      return fail(503, 'not_configured', 'Time-gränsen är inte konfigurerad för lager.contextImport.');
    }
    return handleLagerContextImport({
      admin,
      organizationId: access.organizationId,
      body,
      adapterUrl: importAdapterUrl,
      anonKey: Deno.env.get('TIME_ADAPTER_ANON_KEY'),
      signingSeed,
    });
  }

  if (!ALLOWED_OPERATIONS.has(operation)) {
    return fail(400, 'unsupported_operation', `Unsupported Time operation: ${operation || '(none)'}`);
  }

  // Isolated staging/test configuration only. No value is invented here.
  const adapterUrl = Deno.env.get('TIME_ADAPTER_URL');
  const anonKey = Deno.env.get('TIME_ADAPTER_ANON_KEY');
  // Time's tenant id for this Planning tenant. Server-side only; never from the client.
  const timeOrganizationId = Deno.env.get('TIME_ADAPTER_ORGANIZATION_ID') ?? access.organizationId;

  const missing = [
    !adapterUrl ? 'TIME_ADAPTER_URL' : null,
    !signingSeed ? 'TIME_ADAPTER_SIGNING_SEED' : null,
  ].filter(Boolean);
  if (missing.length) {
    return fail(
      503,
      'not_configured',
      `Time-gränsen är inte konfigurerad. Saknad servernyckel: ${missing.join(', ')}.`,
      false,
    );
  }

  const payload: Record<string, unknown> = {
    schema: TIME_BOUNDARY_SCHEMA,
    organizationId: timeOrganizationId,
    operation,
  };
  for (const key of FORWARDABLE) {
    if (body[key] !== undefined && body[key] !== null) payload[key] = body[key];
  }

  const bodyText = JSON.stringify(payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EventFlow-Consumer': 'planning-time-v2',
  };
  if (anonKey) headers.apikey = anonKey;

  // The ONLY signing path: seed-derived, non-extractable ES256 key.
  // ONE header, compact ES256 JWT, digest bound to the exact bytes sent below.
  try {
    const { key, keyId } = await deriveSigningKeyFromSeed(signingSeed!);
    headers[SERVICE_PROOF_HEADER] = await signServiceProofJwt(
      key,
      keyId,
      buildServiceProofClaims({
        operation,
        organizationId: String(timeOrganizationId),
        bodySha256: await sha256Hex(bodyText),
      }),
    );
  } catch (e) {
    return fail(503, 'not_configured', `Tjänstesignering misslyckades: ${(e as Error)?.message ?? 'okänt fel'}`);
  }


  let upstream: Response;
  try {
    upstream = await fetch(`${adapterUrl!.replace(/\/+$/, '')}/time-planning-adapter`, {
      method: 'POST',
      headers,
      body: bodyText,
    });
  } catch (e) {
    return fail(503, 'upstream_unavailable', `Time-gränsen gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`, true);
  }

  const raw = await upstream.json().catch(() => null);
  // NOTE: logs header NAMES only — never header values, seed, or key material.
  console.log('[time-planning-proxy] upstream', {
    operation,
    status: upstream.status,
    sentHeaders: Object.keys(headers).join(','),
    hasAnonKey: Boolean(anonKey),
    organizationId: String(timeOrganizationId),
    body: JSON.stringify(raw)?.slice(0, 500),
  });
  if (!upstream.ok) {
    const detail = (raw ?? {}) as Record<string, unknown>;
    return json(upstream.status, {
      schema: 'time-planning-boundary-error.v1',
      code: typeof detail.code === 'string' ? detail.code : 'boundary_rejected',
      retryable: detail.retryable === true,
      error: typeof detail.error === 'string' ? detail.error : `Time-gränsen svarade ${upstream.status}.`,
    });
  }

  const envelope = (raw ?? {}) as Record<string, unknown>;
  if (envelope.adapterVersion !== TIME_ADAPTER_VERSION) {
    return fail(502, 'contract_mismatch', `Oväntad adapterversion från Time: ${String(envelope.adapterVersion ?? 'okänd')}.`);
  }

  return json(200, {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: TIME_ADAPTER_VERSION,
    operation,
    generatedAt: envelope.generatedAt ?? new Date().toISOString(),
    data: scrub(envelope.data),
  });
});
