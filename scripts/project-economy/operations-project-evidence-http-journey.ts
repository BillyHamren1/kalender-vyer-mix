// Isolated signed fixture JWT -> actual PostgREST -> unchanged public reader.
import { validateProjectCateringEvidenceParity } from '../../src/lib/economy/projectCateringEvidenceParity.ts';
import { validateScopeObligationEvidence } from '../../src/lib/economy/projectScopeObligationEvidence.ts';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  projectA = id(7),
  projectB = id(70),
  admin = id(9),
  grantee = id(92),
  foreign = id(93),
  foreignOrg = id(99),
  foreignProject = id(98);
const expectedDatabase = 'eventflow_project_evidence_http_runtime';
let phase = 'isolated guard',
  passed = 0;
function requireTrue(v: unknown, message: string): asserts v {
  if (!v) throw new Error(message);
}
function localEndpoint(value: string | undefined): URL {
  requireTrue(typeof value === 'string', 'local endpoint required');
  const u = new URL(value);
  requireTrue(
    u.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password,
    'loopback endpoint required',
  );
  return u;
}
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
async function jwt(secret: string, actor: string | null): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(
      new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    ),
    body = b64(
      new TextEncoder().encode(
        JSON.stringify({
          role: 'authenticated',
          ...(actor ? { sub: actor } : {}),
          iat: now,
          exp: now + 600,
        }),
      ),
    );
  const raw = head + '.' + body;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return (
    raw +
    '.' +
    b64(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)),
      ),
    )
  );
}
async function boundedJson(
  response: Response,
  started: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  requireTrue(reader, 'response body required');
  const parts: Uint8Array[] = [];
  let bytes = 0,
    chunks = 0;
  try {
    while (true) {
      requireTrue(performance.now() - started < 15_000, 'response deadline');
      const { value, done } = await reader.read();
      if (done) break;
      requireTrue(++chunks <= 4096, 'response chunk bound');
      if (!value.length) continue;
      bytes += value.length;
      requireTrue(bytes <= 2 * 1024 * 1024, 'response byte bound');
      parts.push(value);
    }
    const all = new Uint8Array(bytes);
    let pos = 0;
    for (const p of parts) {
      all.set(p, pos);
      pos += p.length;
    }
    const result = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(all),
    );
    requireTrue(performance.now() - started < 15_000, 'response deadline');
    return result;
  } finally {
    void reader.cancel().catch(() => {});
  }
}
async function rpc(
  base: URL,
  name: string,
  token: string,
  body: unknown,
  status: number,
): Promise<unknown> {
  requireTrue(
    [
      'read_operations_catering_project_evidence_v3',
      'read_operations_scope_obligation_evidence_v1',
      'grant_operations_project_personnel_review_v1',
    ].includes(name),
    'unexpected RPC',
  );
  const started = performance.now();
  const response = await fetch(new URL('rpc/' + name, base), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  requireTrue(
    response.status === status,
    'unexpected authenticated RPC status',
  );
  return boundedJson(response, started);
}
const cateringBody = (organizationId = org, projectId = projectA) => ({
  p_organization_id: organizationId,
  p_project_id: projectId,
});
const scopeBody = (organizationId = org, rootId = projectA) => ({
  p_organization_id: organizationId,
  p_root_kind: 'project',
  p_root_id: rootId,
});
async function control(
  base: URL,
  token: string,
  operation:
    | 'state'
    | 'move-admin-org'
    | 'restore-admin-org'
    | 'delete-project-a'
    | 'revoke-admin',
): Promise<Record<string, unknown>> {
  const started = performance.now();
  const response = await fetch(new URL(operation, base), {
    method: operation === 'state' ? 'GET' : 'POST',
    headers: {
      'x-project-evidence-control-token': token,
      ...(operation === 'state' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(operation === 'state'
      ? {}
      : { body: JSON.stringify({ fixture: 'project-evidence-http-v1' }) }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  requireTrue(response.status === 200, 'bounded fixture control failed');
  const data = await boundedJson(response, started);
  requireTrue(
    !!data && typeof data === 'object' && !Array.isArray(data),
    'control shape',
  );
  if (operation !== 'state')
    requireTrue(
      Object.keys(data).length === 2 &&
        (data as Record<string, unknown>).status === 'accepted' &&
        (data as Record<string, unknown>).operation === operation,
      'fixed control receipt mismatch',
    );
  return data as Record<string, unknown>;
}
const done = (name: string) => {
  passed++;
  console.log(JSON.stringify({ case: name, result: 'PASS' }));
};
const stateKeys = [
  'databaseName',
  'cateringPublications',
  'cateringObservations',
  'cateringOutbox',
  'invoiceSnapshots',
  'baselines',
  'compositions',
];
function counts(v: Record<string, unknown>): Record<string, unknown> {
  requireTrue(
    Object.keys(v).length === stateKeys.length &&
      stateKeys.every((k) => Object.hasOwn(v, k)) &&
      v.databaseName === expectedDatabase,
    'wrong control database/domain',
  );
  for (const k of stateKeys.slice(1))
    requireTrue(
      typeof v[k] === 'number' &&
        Number.isSafeInteger(v[k]) &&
        (v[k] as number) > 0,
      'invalid evidence count',
    );
  return v;
}
async function main() {
  requireTrue(
    Deno.env.get('CI') === 'true' &&
      Deno.env.get('ISOLATED_PROJECT_EVIDENCE_HTTP') === 'true' &&
      Deno.env.get('PROJECT_EVIDENCE_DATABASE_NAME') === expectedDatabase,
    'isolated runtime required',
  );
  const base = localEndpoint(Deno.env.get('PROJECT_EVIDENCE_POSTGREST_URL')),
    controls = localEndpoint(Deno.env.get('PROJECT_EVIDENCE_CONTROL_URL'));
  const secret = Deno.env.get('PROJECT_EVIDENCE_JWT_SECRET'),
    controlToken = Deno.env.get('PROJECT_EVIDENCE_CONTROL_TOKEN');
  requireTrue(
    typeof secret === 'string' &&
      new TextEncoder().encode(secret).length >= 32 &&
      typeof controlToken === 'string' &&
      new TextEncoder().encode(controlToken).length >= 32 &&
      secret !== controlToken,
    'distinct ephemeral credentials required',
  );
  const [adminJwt, granteeJwt, foreignJwt, noActorJwt, unknownJwt] =
    await Promise.all([
      jwt(secret, admin),
      jwt(secret, grantee),
      jwt(secret, foreign),
      jwt(secret, null),
      jwt(secret, id(94)),
    ]);
  const before = counts(await control(controls, controlToken, 'state'));
  requireTrue(
    before.cateringPublications === 4 &&
      before.cateringObservations === 4 &&
      before.cateringOutbox === 4 &&
      before.invoiceSnapshots === 1 &&
      before.baselines === 1 &&
      before.compositions === 1,
    'wrong source fixture membership',
  );
  phase = 'copied Catering and persistent opaque withdrawal';
  const a = validateProjectCateringEvidenceParity(
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      adminJwt,
      cateringBody(),
      200,
    ),
    org,
    projectA,
  );
  requireTrue(
    a.lines.length === 1 &&
      a.lines[0].amountMinor === 52502 &&
      a.lines[0].sourceStatus === 'pending' &&
      a.lines[0].status === 'preliminary' &&
      a.withdrawals.length === 1 &&
      a.withdrawals[0].revision === 3 &&
      a.currencyTotals[0].receivedTotalMinor === 52502 &&
      a.upstreamCurrentness === 'unverified',
    'copy/current head/withdrawal mismatch',
  );
  done(phase);
  phase = 'missing cost remains null';
  const b = validateProjectCateringEvidenceParity(
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      adminJwt,
      cateringBody(org, projectB),
      200,
    ),
    org,
    projectB,
  );
  requireTrue(
    b.lines.length === 1 &&
      b.lines[0].amountMinor === null &&
      b.evidenceState === 'incomplete' &&
      b.currencyTotals[0].knownMinor === null &&
      b.currencyTotals[0].receivedTotalMinor === null,
    'missing cost fabricated',
  );
  done(phase);
  phase = 'exact saved manual scope and no forecast';
  const s = validateScopeObligationEvidence(
    await rpc(
      base,
      'read_operations_scope_obligation_evidence_v1',
      adminJwt,
      scopeBody(),
      200,
    ),
    org,
    'project',
    projectA,
  );
  requireTrue(
    s.knownEstimateMinor === 1000000 &&
      s.knownCommitmentMinor === null &&
      s.sources.length === 1 &&
      s.sources[0].observedAmountMinor === 540000 &&
      s.eacMinor === null &&
      s.budgetMinor === null &&
      s.marginMinor === null &&
      s.coverage === 'unavailable' &&
      s.upstreamCurrentness === 'unverified',
    'manual/source evidence promotion',
  );
  done(phase);
  phase = 'no exact scope gives no child fallback';
  const empty = validateScopeObligationEvidence(
    await rpc(
      base,
      'read_operations_scope_obligation_evidence_v1',
      adminJwt,
      scopeBody(org, projectB),
      200,
    ),
    org,
    'project',
    projectB,
  );
  requireTrue(
    empty.state === 'no_scope' &&
      empty.knownEstimateMinor === null &&
      empty.eacMinor === null,
    'fallback or zero fabricated',
  );
  done(phase);
  phase = 'grant required';
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    granteeJwt,
    cateringBody(),
    403,
  );
  done(phase);
  phase = 'accepted actual scoped grant';
  const grant = (await rpc(
    base,
    'grant_operations_project_personnel_review_v1',
    adminJwt,
    {
      p_project_id: projectA,
      p_system_user_id: grantee,
      p_expected_grant_sequence: 0,
      p_decision: 'granted',
      p_reason: 'Isolated authenticated read grant',
      p_idempotency_key: 'isolated-http-evidence-grant',
    },
    200,
  )) as Record<string, unknown>;
  requireTrue(
    grant.status === 'accepted' &&
      typeof grant.grant_sequence === 'number' &&
      Number.isSafeInteger(grant.grant_sequence) &&
      grant.grant_sequence > 0,
    'grant not accepted',
  );
  const allowed = validateProjectCateringEvidenceParity(
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      granteeJwt,
      cateringBody(),
      200,
    ),
    org,
    projectA,
  );
  requireTrue(allowed.lines[0].amountMinor === 52502, 'granted copy mismatch');
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    granteeJwt,
    cateringBody(org, projectB),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    granteeJwt,
    scopeBody(),
    403,
  );
  done(phase);
  phase = 'actual exact receipt revoke and denied reread';
  const revoke = (await rpc(
    base,
    'grant_operations_project_personnel_review_v1',
    adminJwt,
    {
      p_project_id: projectA,
      p_system_user_id: grantee,
      p_expected_grant_sequence: grant.grant_sequence,
      p_decision: 'revoked',
      p_reason: 'Isolated authenticated read revoke',
      p_idempotency_key: 'isolated-http-evidence-revoke',
    },
    200,
  )) as Record<string, unknown>;
  requireTrue(
    revoke.status === 'accepted' &&
      typeof revoke.grant_sequence === 'number' &&
      Number.isSafeInteger(revoke.grant_sequence) &&
      revoke.grant_sequence > (grant.grant_sequence as number),
    'revoke not accepted',
  );
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    granteeJwt,
    cateringBody(),
    403,
  );
  done(phase);
  phase = 'foreign signed actor cannot read source organization';
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    foreignJwt,
    cateringBody(),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    foreignJwt,
    scopeBody(),
    403,
  );
  const own = validateProjectCateringEvidenceParity(
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      foreignJwt,
      cateringBody(foreignOrg, foreignProject),
      200,
    ),
    foreignOrg,
    foreignProject,
  );
  requireTrue(
    own.evidenceState === 'no_evidence',
    'foreign own namespace mismatch',
  );
  done(phase);
  phase = 'wrong actual profile organization selector';
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    adminJwt,
    cateringBody(foreignOrg),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    adminJwt,
    scopeBody(foreignOrg),
    403,
  );
  done(phase);
  phase = 'missing or nonexistent authenticated actor';
  for (const token of [noActorJwt, unknownJwt]) {
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      token,
      cateringBody(),
      403,
    );
    await rpc(
      base,
      'read_operations_scope_obligation_evidence_v1',
      token,
      scopeBody(),
      403,
    );
  }
  done(phase);
  phase = 'signature really verified';
  const parts = adminJwt.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    parts.join('.'),
    cateringBody(),
    401,
  );
  done(phase);
  phase = 'live organization change invalidates old tuple';
  await control(controls, controlToken, 'move-admin-org');
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    adminJwt,
    cateringBody(),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    adminJwt,
    scopeBody(),
    403,
  );
  await control(controls, controlToken, 'restore-admin-org');
  validateProjectCateringEvidenceParity(
    await rpc(
      base,
      'read_operations_catering_project_evidence_v3',
      adminJwt,
      cateringBody(),
      200,
    ),
    org,
    projectA,
  );
  done(phase);
  phase = 'deleted live root denied';
  await control(controls, controlToken, 'delete-project-a');
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    adminJwt,
    cateringBody(),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    adminJwt,
    scopeBody(),
    403,
  );
  done(phase);
  phase = 'live administrator revoke denied';
  await control(controls, controlToken, 'revoke-admin');
  await rpc(
    base,
    'read_operations_catering_project_evidence_v3',
    adminJwt,
    cateringBody(org, projectB),
    403,
  );
  await rpc(
    base,
    'read_operations_scope_obligation_evidence_v1',
    adminJwt,
    scopeBody(org, projectB),
    403,
  );
  done(phase);
  phase = 'no cost evidence written by reads or fixture identity controls';
  const after = counts(await control(controls, controlToken, 'state'));
  requireTrue(
    stateKeys.every((k) => before[k] === after[k]),
    'read/identity changes wrote financial evidence',
  );
  done(phase);
  console.log(
    JSON.stringify({
      result: 'PASS',
      cases: passed,
      scope:
        'native signed fixture JWT/PostgREST authorization; received evidence only',
    }),
  );
}
if (import.meta.main)
  try {
    await main();
  } catch {
    console.error(
      JSON.stringify({
        case: phase,
        result: 'FAIL',
        reason: 'authenticated project evidence proof failed',
      }),
    );
    Deno.exit(1);
  }
