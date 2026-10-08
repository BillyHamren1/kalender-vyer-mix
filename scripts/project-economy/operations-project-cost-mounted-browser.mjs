// TEST ONLY: actual App + signed synthetic actor JWT + genuine native PostgREST.
// No GoTrue/human/provider proof and no financial response substitution.
import { createHmac } from 'node:crypto';
import { validateProjectCostState } from './operations-project-cost-mounted-state.mjs';
import { fileURLToPath } from 'node:url';
import {
  assertMountedEndpoint,
  allowedMountedRead,
  classifyMountedWrite,
} from './operations-obligation-mounted-browser.mjs';
const DB = 'eventflow_project_evidence_http_runtime';
const ORIGIN = 'https://pihrhltinhewhoxefjxv.supabase.co';
const RPC = '/rest/v1/rpc/read_operations_project_cost_evidence_v1';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function check(v) {
  if (!v) throw new Error('project cost mounted boundary');
}
function exact(v, keys) {
  check(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k)),
  );
  return v;
}
export function assertProjectCostIsolation(env) {
  check(
    env.CI === 'true' &&
      env.ISOLATED_PROJECT_EVIDENCE_HTTP === 'true' &&
      env.PROJECT_EVIDENCE_DATABASE_NAME === DB,
  );
}
export function validateProjectCostSelectors(value) {
  const x = exact(value, [
    'schema',
    'organizationId',
    'actorId',
    'projectId',
    'knownReportId',
    'missingReportId',
  ]);
  check(
    x.schema === 'operations-project-cost-mounted-selectors.v1' &&
      x.organizationId === id(1) &&
      x.actorId === id(199) &&
      x.projectId === id(1017),
  );
  check(
    uuid(x.knownReportId) &&
      uuid(x.missingReportId) &&
      x.knownReportId !== x.missingReportId,
  );
  return x;
}
export function allowedProjectCostRead(url, method) {
  const u = new URL(url);
  if (u.origin !== ORIGIN || u.username || u.password || u.hash) return false;
  if (method === 'GET') return allowedMountedRead(url, 'GET');
  if (method === 'OPTIONS')
    return !u.search && (u.pathname === RPC || allowedMountedRead(url, 'GET'));
  return method === 'POST' && !u.search && u.pathname === RPC;
}
export function validateProjectCostRpc(path, raw, selectors) {
  validateProjectCostSelectors(selectors);
  check(
    path === RPC && typeof raw === 'string' && Buffer.byteLength(raw) <= 262144,
  );
  const x = exact(JSON.parse(raw), ['p_organization_id', 'p_project_id']);
  check(
    x.p_organization_id === selectors.organizationId &&
      x.p_project_id === selectors.projectId,
  );
  return 'project_cost';
}
export { validateProjectCostState } from './operations-project-cost-mounted-state.mjs';
export async function boundedProjectCostBody(response, milliseconds = 15000) {
  check(
    Number.isSafeInteger(milliseconds) &&
      milliseconds > 0 &&
      milliseconds <= 15000,
  );
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(),
    start = performance.now(),
    parts = [];
  let bytes = 0,
    chunks = 0,
    expired = false,
    timer;
  const stop = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      void reader.cancel().catch(() => {});
      reject(new Error('project cost body deadline'));
    }, milliseconds);
  });
  try {
    while (true) {
      check(!expired && performance.now() - start < milliseconds);
      const r = await Promise.race([reader.read(), stop]);
      check(!expired && performance.now() - start < milliseconds);
      if (r.done) break;
      check(++chunks <= 4096);
      if (!r.value.byteLength) continue;
      bytes += r.value.byteLength;
      check(bytes <= 2097152);
      parts.push(Buffer.from(r.value));
    }
    return Buffer.concat(parts, bytes);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
function sign(secret, actor) {
  const now = Math.floor(Date.now() / 1000),
    b = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const raw = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ role: 'authenticated', sub: actor, iat: now, exp: now + 600 })}`;
  return `${raw}.${createHmac('sha256', secret).update(raw).digest('base64url')}`;
}
export const PROJECT_COST_MOUNTED_CASES = Object.freeze([
  'actual old project reader copies known and unavailable personnel costs',
  'actual old project evidence leaves saved legacy headline unchanged',
  'actual App persistence excludes loaded old project evidence',
  'actual project user reads only explicitly granted local cost evidence',
  'foreign actual actor cannot mount another tenant cost evidence',
  'live profile organization change denies cached old project money',
  'native admin role revocation denies fresh old project evidence',
  'actual old project journey sends no writes or forwarding failures and preserves saved evidence',
]);
async function control(base, token, operation) {
  check(
    ['state', 'move-admin-org', 'restore-admin-org', 'revoke-admin'].includes(
      operation,
    ),
  );
  const read = operation === 'state';
  const response = await fetch(
    `${base}/${read ? 'project-cost/state' : `drilldown/${operation}`}`,
    {
      method: read ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'x-project-evidence-control-token': token,
        ...(!read ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(!read
        ? {
            body: JSON.stringify({
              fixture: 'project-evidence-drilldown-http-v1',
            }),
          }
        : {}),
    },
  );
  const data = JSON.parse(
    (await boundedProjectCostBody(response)).toString('utf8'),
  );
  check(response.status === 200);
  if (read) return validateProjectCostState(data);
  exact(data, ['status', 'operation']);
  check(
    data.status === 'accepted' && data.operation === `drilldown/${operation}`,
  );
  return data;
}
async function setup(browser, app, backend, secret, actor, selectors) {
  const token = sign(secret, actor),
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
  const reads = [],
    writes = [],
    failures = [];
  await context.routeWebSocket('**', (s) => s.close());
  await context.route('**/*', async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      method = req.method();
    if (u.origin === app && ['GET', 'HEAD'].includes(method))
      return route.continue();
    if (!allowedProjectCostRead(req.url(), method)) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method))
        writes.push(classifyMountedWrite(req.url(), app));
      return route.abort('blockedbyclient');
    }
    try {
      const headers = await req.allHeaders();
      if (method !== 'OPTIONS')
        check(headers.authorization === `Bearer ${token}`);
      const kind =
        method === 'POST'
          ? validateProjectCostRpc(u.pathname, req.postData(), selectors)
          : method === 'OPTIONS'
            ? 'preflight'
            : 'table';
      const response = await fetch(
        `${backend}${u.pathname.slice('/rest/v1'.length)}${u.search}`,
        {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers,
          ...(method === 'POST' ? { body: req.postDataBuffer() } : {}),
        },
      );
      const body = await boundedProjectCostBody(response),
        h = Object.fromEntries(response.headers.entries());
      for (const k of [
        'content-encoding',
        'transfer-encoding',
        'content-length',
      ])
        delete h[k];
      if (method !== 'OPTIONS') reads.push({ kind, status: response.status });
      await route.fulfill({ status: response.status, headers: h, body });
    } catch {
      failures.push('native_forward');
      await route.abort('failed');
    }
  });
  await context.addInitScript(
    ({ token, actor }) =>
      localStorage.setItem(
        'eventflow-planning-auth',
        JSON.stringify({
          access_token: token,
          refresh_token: 'isolated-unused-refresh-token',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 600,
          expires_in: 600,
          user: {
            id: actor,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'isolated@example.invalid',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: '2026-10-02T00:00:00Z',
          },
        }),
      ),
    { token, actor },
  );
  return { context, page: await context.newPage(), reads, writes, failures };
}
let accepted = 0;
export async function runProjectCostMounted() {
  assertProjectCostIsolation(process.env);
  check(
    process.env.OPERATIONS_MOUNTED_BROWSER_GATE_MODE ===
      'project_cost_evidence',
  );
  const app = assertMountedEndpoint(
      process.env.OPERATIONS_MOUNTED_BROWSER_URL,
      '55612',
    ),
    backend = assertMountedEndpoint(
      process.env.PROJECT_EVIDENCE_POSTGREST_URL,
      '55610',
    ),
    controls = assertMountedEndpoint(
      process.env.PROJECT_EVIDENCE_CONTROL_URL,
      '55611',
    );
  const secret = process.env.PROJECT_EVIDENCE_JWT_SECRET,
    privateToken = process.env.PROJECT_EVIDENCE_CONTROL_TOKEN;
  check(
    typeof secret === 'string' &&
      Buffer.byteLength(secret) >= 32 &&
      typeof privateToken === 'string' &&
      Buffer.byteLength(privateToken) >= 32 &&
      secret !== privateToken,
  );
  const raw = process.env.OPERATIONS_PROJECT_COST_MOUNTED_SELECTORS;
  check(typeof raw === 'string' && Buffer.byteLength(raw) < 16384);
  const selectors = validateProjectCostSelectors(JSON.parse(raw)),
    { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true }),
    contexts = [],
    all = [];
  const pass = () => {
    console.log(
      JSON.stringify({
        case: PROJECT_COST_MOUNTED_CASES[accepted],
        result: 'PASS',
      }),
    );
    accepted++;
  };
  const visit = async (t) =>
    t.page.goto(`${app}/project/${selectors.projectId}/economy`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  const panel = (t) =>
    t.page
      .getByRole('heading', { name: 'Kostnadsunderlag', exact: true })
      .locator('../..');
  const known = (t) =>
    panel(t).getByRole('region', { name: 'Personalkostnadsunderlag' });
  try {
    const before = await control(controls, privateToken, 'state');
    const t = await setup(
      browser,
      app,
      backend,
      secret,
      selectors.actorId,
      selectors,
    );
    contexts.push(t.context);
    all.push(t);
    await visit(t);
    await expect(
      t.page.getByRole('heading', {
        name: 'Isolerad ekonomiverifiering',
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    // Actual component uses a section aria-label, implicit region requires accessible name.
    await expect(known(t).getByText(/^1,81\s*kr$/)).toBeVisible({
      timeout: 30000,
    });
    await expect(
      known(t).getByText('Kostnad saknas', { exact: true }),
    ).toBeVisible();
    await expect(
      panel(t).getByText(
        'Kostnadssats saknas för 1 tidsrader. Kostnaden är inte komplett.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      known(t).getByText('Tid 1 · kostnad 1', { exact: true }),
    ).toHaveCount(2);
    await expect(
      known(t).getByText('Inväntar kvitto', { exact: true }),
    ).toHaveCount(2);
    await expect(
      known(t).getByText(/10860|000000007001|000000007002/),
    ).toHaveCount(0);
    check(t.reads.some((r) => r.kind === 'project_cost' && r.status === 200));
    pass();
    const card = t.page
      .getByText('Total kostnad', { exact: true })
      .locator('../..');
    await expect(card).toContainText(/700\s*kr/);
    const headline = await card.innerText();
    await expect(
      panel(t)
        .getByRole('region', { name: 'Projektkopplade leverantörsfakturor' })
        .getByText(/^1\s*800,00\s*kr$/),
    ).toBeVisible();
    await expect(card).toHaveText(headline, { useInnerText: true });
    pass();
    await expect
      .poll(
        () =>
          t.page.evaluate(() => {
            const raw = localStorage.getItem('lovable-rq-cache-v1');
            if (!raw) return false;
            const q = JSON.parse(raw).clientState?.queries;
            return (
              Array.isArray(q) &&
              q.some((x) => x.queryKey?.[0] === 'project') &&
              q.every(
                (x) => x.queryKey?.[0] !== 'operations-project-cost-evidence',
              )
            );
          }),
        { timeout: 10000 },
      )
      .toBe(true);
    pass();
    const member = await setup(
      browser,
      app,
      backend,
      secret,
      id(292),
      selectors,
    );
    contexts.push(member.context);
    all.push(member);
    await visit(member);
    await expect(known(member).getByText(/^1,81\s*kr$/)).toBeVisible({
      timeout: 30000,
    });
    check(
      member.reads.some((r) => r.kind === 'project_cost' && r.status === 200),
    );
    pass();
    const foreign = await setup(
      browser,
      app,
      backend,
      secret,
      id(93),
      selectors,
    );
    contexts.push(foreign.context);
    all.push(foreign);
    await visit(foreign);
    await expect(
      foreign.page.getByText('Projektet hittades inte', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    check(!foreign.reads.some((r) => r.kind === 'project_cost'));
    pass();
    await control(controls, privateToken, 'move-admin-org');
    await expect
      .poll(
        () =>
          t.reads.some((r) => r.kind === 'project_cost' && r.status === 403),
        { timeout: 45000 },
      )
      .toBe(true);
    await expect(
      panel(t).getByText('Kostnadsunderlaget är inte tillgängligt.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(known(t)).toHaveCount(0);
    await control(controls, privateToken, 'restore-admin-org');
    pass();
    await t.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(known(t).getByText(/^1,81\s*kr$/)).toBeVisible({
      timeout: 30000,
    });
    const denied = t.reads.filter(
      (r) => r.kind === 'project_cost' && r.status === 403,
    ).length;
    await control(controls, privateToken, 'revoke-admin');
    await expect
      .poll(
        () =>
          t.reads.filter((r) => r.kind === 'project_cost' && r.status === 403)
            .length,
        { timeout: 45000 },
      )
      .toBeGreaterThan(denied);
    await expect(
      panel(t).getByText('Kostnadsunderlaget är inte tillgängligt.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(known(t)).toHaveCount(0);
    pass();
    for (const x of all)
      check(x.writes.length === 0 && x.failures.length === 0);
    check(
      JSON.stringify(before) ===
        JSON.stringify(await control(controls, privateToken, 'state')),
    );
    await expect(card).toContainText(/700\s*kr/);
    pass();
    check(accepted === PROJECT_COST_MOUNTED_CASES.length);
    console.log(
      JSON.stringify({
        result: 'PASS',
        gateMode: 'project_cost_evidence',
        cases: accepted,
        scope:
          'actual App/native signed synthetic JWT/PostgREST; received evidence only',
      }),
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
// Generator is a distinct private fixture command, using the REAL Operations calculator.
export async function buildProjectCostMountedFixture() {
  const { calculatePersonnelCostSnapshot } =
    await import('../../supabase/functions/_shared/project-personnel-cost.ts');
  const target = {
    sourceSystem: 'planning',
    kind: 'project',
    externalId: id(1017),
    version: 'isolated-mounted-v1',
  };
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  async function raw(worker, date, minutes, line) {
    const doc = {
      schemaVersion: 'day-submission.v1',
      organizationId: id(7000),
      workerId: worker,
      workDate: date,
      timezone: 'Europe/Stockholm',
      version: 1,
      status: 'submitted',
      syncState: 'synced',
      attestation: {
        confirmedByWorker: true,
        targetKeys: [`planning:project:${id(1017)}:isolated-mounted-v1`],
      },
      blocks: [
        {
          id: line,
          kind: 'work',
          durationMinutes: minutes,
          startsAt: `${date}T08:00:00Z`,
          endsAt: `${date}T08:${String(minutes).padStart(2, '0')}:00Z`,
          target,
          requiresTargetConfirmation: true,
        },
      ],
    };
    const hash = Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(canonical(doc))),
      ),
    ).toString('hex');
    return {
      ...doc,
      snapshotHash: hash,
      id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
    };
  }
  const make = async (worker, timeWorker, date, minutes, line, rates) => {
    const source = await raw(timeWorker, date, minutes, line);
    const ctx = {
      organization_id: id(1),
      time_organization_id: id(7000),
      time_auth_worker_id: timeWorker,
      worker_id: worker,
      source_time_stream_id: `${worker}:${date}`,
      source_revision: 1,
      project_review_status: 'preliminary',
      allocations: [
        {
          organization_id: id(1),
          source_time_line_id: line,
          target,
          source_project_id: id(1017),
          source_booking_id: null,
          currency: 'SEK',
        },
      ],
      rates,
    };
    return {
      raw: source,
      snapshot: await calculatePersonnelCostSnapshot(source, ctx),
    };
  };
  const rate = {
    organization_id: id(1),
    worker_id: id(7001),
    category: 'work',
    currency: 'SEK',
    rate_revision: 'isolated-mounted-rate-v1',
    hourly_rate_minor: 10860,
    effective_from: '2026-01-01',
    effective_to: null,
  };
  return {
    schema: 'operations-project-cost-mounted-fixture.v1',
    known: await make(
      id(7001),
      id(8001),
      '2026-10-01',
      1,
      'mounted-personnel-known',
      [rate],
    ),
    missing: await make(
      id(7002),
      id(8002),
      '2026-10-02',
      15,
      'mounted-personnel-missing',
      [],
    ),
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--fixture') {
      assertProjectCostIsolation(process.env);
      check(typeof Deno === 'object');
      console.log(JSON.stringify(await buildProjectCostMountedFixture()));
    } else {
      check(process.argv.length === 2);
      await runProjectCostMounted();
    }
  } catch {
    console.log(
      JSON.stringify({
        result: 'FAIL',
        gateMode: 'project_cost_evidence',
        accepted_prefix: Math.min(accepted, PROJECT_COST_MOUNTED_CASES.length),
        next_case:
          PROJECT_COST_MOUNTED_CASES[accepted] ?? 'isolated mode guard',
      }),
    );
    process.exitCode = 1;
  }
}
