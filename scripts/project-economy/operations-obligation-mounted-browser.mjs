// Actual mounted product route + genuine native PostgREST; never fulfill evidence fixtures.
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DATABASE = 'eventflow_project_evidence_http_runtime';
const SOURCE_ORIGIN = 'https://pihrhltinhewhoxefjxv.supabase.co';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function assert(value, phase = 'mounted browser boundary') {
  if (!value) throw new Error(phase);
}
function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
  return value;
}
export function assertMountedEndpoint(value, port) {
  assert(
    typeof value === 'string' && ['55610', '55611', '55612'].includes(port),
  );
  const u = new URL(value);
  assert(
    u.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
      u.port === port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/',
  );
  return u.origin;
}
const tablePaths = new Set(
  [
    'profiles',
    'user_roles',
    'projects',
    'bookings',
    'large_projects',
    'project_budget',
    'project_purchases',
    'project_labor_costs',
    'project_staff_time_cost_lines',
    'product_cost_overrides',
    'project_billing',
    'project_tasks',
    'project_files',
    'project_activity_log',
  ].map((table) => `/rest/v1/${table}`),
);
const scopeRpc = '/rest/v1/rpc/read_operations_scope_obligation_evidence_v1';
const leafRpc = '/rest/v1/rpc/read_operations_scope_obligation_drilldown_v1';
const writeKinds = [
  'auth_post',
  'rpc_post',
  'report_diagnostic',
  'mapbox_token',
  'other_function',
  'rest_write',
  'browser_origin_write',
  'foreign_write',
  'other_source_write',
];
const forwardStages = [
  'headers',
  'authorization',
  'rpc_shape',
  'native_fetch',
  'native_body',
  'native_fulfill',
];
const readKinds = [
  ...[...tablePaths].map((path) => path.slice('/rest/v1/'.length)),
  'scope',
  'leaf',
  'unknown_leaf',
  'preflight',
];
export function classifyMountedWrite(url, app) {
  const u = new URL(url);
  if (u.origin === app) return 'browser_origin_write';
  if (u.origin !== SOURCE_ORIGIN) return 'foreign_write';
  if (u.pathname.startsWith('/auth/v1/')) return 'auth_post';
  if (u.pathname.startsWith('/rest/v1/rpc/')) return 'rpc_post';
  if (u.pathname.startsWith('/functions/v1/'))
    return u.pathname === '/functions/v1/report-diagnostic'
      ? 'report_diagnostic'
      : u.pathname === '/functions/v1/mapbox-token'
        ? 'mapbox_token'
        : 'other_function';
  if (u.pathname.startsWith('/rest/v1/')) return 'rest_write';
  return 'other_source_write';
}
export function mountedFailureCounts(writes, failures) {
  const writeCounts = Object.fromEntries(writeKinds.map((key) => [key, 0]));
  const forwardCounts = Object.fromEntries(
    forwardStages.map((key) => [key, 0]),
  );
  const forwardKinds = Object.fromEntries(readKinds.map((key) => [key, 0]));
  for (const kind of writes) {
    assert(Object.hasOwn(writeCounts, kind));
    writeCounts[kind] = Math.min(1000, writeCounts[kind] + 1);
  }
  for (const failure of failures) {
    exact(failure, ['stage', 'kind']);
    assert(
      Object.hasOwn(forwardCounts, failure.stage) &&
        Object.hasOwn(forwardKinds, failure.kind),
    );
    forwardCounts[failure.stage] = Math.min(
      1000,
      forwardCounts[failure.stage] + 1,
    );
    forwardKinds[failure.kind] = Math.min(1000, forwardKinds[failure.kind] + 1);
  }
  return { writeCounts, forwardCounts, forwardKinds };
}
export function allowedMountedRead(url, method) {
  const u = new URL(url);
  if (u.origin !== SOURCE_ORIGIN || u.username || u.password || u.hash)
    return false;
  if (method === 'OPTIONS')
    return (
      tablePaths.has(u.pathname) ||
      u.pathname === scopeRpc ||
      u.pathname === leafRpc
    );
  if (method === 'GET') return tablePaths.has(u.pathname);
  return (
    method === 'POST' &&
    !u.search &&
    (u.pathname === scopeRpc || u.pathname === leafRpc)
  );
}
export function validateMountedSelectors(value) {
  const v = exact(value, [
    'schema',
    'organizationId',
    'actorId',
    'projectId',
    'compositionSnapshotId',
    'baselineEventId',
    'obligationId',
    'unknownBaselineEventId',
    'unknownObligationId',
    'baselineRowIndex',
    'unknownBaselineRowIndex',
  ]);
  assert(
    v.schema === 'operations-obligation-mounted-browser-selectors.v1' &&
      v.organizationId === id(1) &&
      v.actorId === id(199) &&
      v.projectId === id(1017) &&
      v.obligationId === id(1018) &&
      v.unknownObligationId === id(1028),
  );
  assert(
    [
      v.compositionSnapshotId,
      v.baselineEventId,
      v.unknownBaselineEventId,
    ].every(uuid) && v.baselineEventId !== v.unknownBaselineEventId,
  );
  assert(
    [v.baselineRowIndex, v.unknownBaselineRowIndex].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= 2,
    ) && v.baselineRowIndex !== v.unknownBaselineRowIndex,
  );
  return v;
}
export function validateMountedRpc(path, rawBody, selectors) {
  assert(typeof rawBody === 'string' && Buffer.byteLength(rawBody) <= 262144);
  const args = JSON.parse(rawBody);
  if (path === scopeRpc) {
    exact(args, ['p_organization_id', 'p_root_kind', 'p_root_id']);
    assert(
      args.p_organization_id === selectors.organizationId &&
        args.p_root_kind === 'project' &&
        args.p_root_id === selectors.projectId,
    );
    return 'scope';
  }
  assert(path === leafRpc);
  exact(args, ['p_request']);
  const q = exact(args.p_request, [
    'schema_version',
    'root_kind',
    'root_id',
    'obligation_id',
    'expected_composition_snapshot_id',
    'expected_baseline_event_id',
  ]);
  assert(
    q.schema_version === 'operations-scope-obligation-drilldown-read.v1' &&
      q.root_kind === 'project' &&
      q.root_id === selectors.projectId &&
      q.expected_composition_snapshot_id === selectors.compositionSnapshotId,
  );
  assert(
    (q.obligation_id === selectors.obligationId &&
      q.expected_baseline_event_id === selectors.baselineEventId) ||
      (q.obligation_id === selectors.unknownObligationId &&
        q.expected_baseline_event_id === selectors.unknownBaselineEventId),
  );
  return q.obligation_id === selectors.obligationId ? 'leaf' : 'unknown_leaf';
}
function jwt(secret, actor) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const raw = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'authenticated', sub: actor, iat: now, exp: now + 600 })}`;
  return `${raw}.${createHmac('sha256', secret).update(raw).digest('base64url')}`;
}
async function boundedBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(),
    started = performance.now(),
    parts = [];
  let bytes = 0,
    chunks = 0;
  try {
    while (true) {
      assert(performance.now() - started < 15000);
      const r = await reader.read();
      assert(performance.now() - started < 15000);
      if (r.done) break;
      assert(++chunks <= 4096);
      if (!r.value.byteLength) continue;
      bytes += r.value.byteLength;
      assert(bytes <= 2097152);
      parts.push(r.value);
    }
    return Buffer.concat(
      parts.map((p) => Buffer.from(p)),
      bytes,
    );
  } finally {
    void reader.cancel().catch(() => {});
  }
}
async function control(base, privateToken, operation) {
  assert(
    ['state', 'move-admin-org', 'restore-admin-org', 'revoke-admin'].includes(
      operation,
    ),
  );
  const isState = operation === 'state';
  const response = await fetch(`${base}/drilldown/${operation}`, {
    method: isState ? 'GET' : 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      'x-project-evidence-control-token': privateToken,
      ...(!isState ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(!isState
      ? {
          body: JSON.stringify({
            fixture: 'project-evidence-drilldown-http-v1',
          }),
        }
      : {}),
  });
  const result = JSON.parse((await boundedBody(response)).toString('utf8'));
  assert(response.status === 200);
  if (!isState) {
    exact(result, ['status', 'operation']);
    assert(
      result.status === 'accepted' &&
        result.operation === `drilldown/${operation}`,
    );
  }
  return result;
}
async function setupBrowser(browser, app, backend, secret, actor, selectors) {
  const signed = jwt(secret, actor);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const observations = [],
    refusedWrites = [],
    failures = [];
  // Realtime is outside this isolated proof; never connect to the real project.
  await context.routeWebSocket('**', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      method = req.method();
    if (u.origin === app && (method === 'GET' || method === 'HEAD')) {
      await route.continue();
      return;
    }
    if (!allowedMountedRead(req.url(), method)) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method))
        refusedWrites.push(classifyMountedWrite(req.url(), app));
      await route.abort('blockedbyclient');
      return;
    }
    let forwardingStage = 'headers';
    let diagnosticKind =
      method === 'OPTIONS'
        ? 'preflight'
        : tablePaths.has(u.pathname)
          ? u.pathname.slice('/rest/v1/'.length)
          : u.pathname === scopeRpc
            ? 'scope'
            : 'leaf';
    try {
      const headers = await req.allHeaders();
      forwardingStage = 'authorization';
      if (method !== 'OPTIONS')
        assert(headers.authorization === `Bearer ${signed}`);
      let kind = 'table';
      if (method === 'POST') {
        forwardingStage = 'rpc_shape';
        kind = validateMountedRpc(u.pathname, req.postData(), selectors);
        diagnosticKind = kind;
      }
      forwardingStage = 'native_fetch';
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
      forwardingStage = 'native_body';
      const body = await boundedBody(response);
      const responseHeaders = Object.fromEntries(response.headers.entries());
      for (const key of [
        'content-encoding',
        'transfer-encoding',
        'content-length',
      ])
        delete responseHeaders[key];
      if (method !== 'OPTIONS')
        observations.push({ kind, path: u.pathname, status: response.status });
      // Body and HTTP status originate exclusively from genuine native PostgREST.
      forwardingStage = 'native_fulfill';
      await route.fulfill({
        status: response.status,
        headers: responseHeaders,
        body,
      });
    } catch {
      failures.push({ stage: forwardingStage, kind: diagnosticKind });
      await route.abort('failed');
    }
  });
  await context.addInitScript(
    ({ accessToken, userId }) => {
      localStorage.setItem(
        'eventflow-planning-auth',
        JSON.stringify({
          access_token: accessToken,
          refresh_token: 'isolated-unused-refresh-token',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 600,
          expires_in: 600,
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'isolated@example.invalid',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: '2026-10-02T00:00:00Z',
          },
        }),
      );
    },
    { accessToken: signed, userId: actor },
  );
  const page = await context.newPage();
  return { context, page, observations, refusedWrites, failures };
}
let phase = 'isolated mounted guard',
  count = 0;
let failedBoundary = 'unknown',
  diagnosticSource = null;
const passed = () => {
  count++;
  console.log(JSON.stringify({ case: phase, result: 'PASS' }));
};
async function main() {
  assert(
    process.env.CI === 'true' &&
      process.env.ISOLATED_PROJECT_EVIDENCE_HTTP === 'true' &&
      process.env.PROJECT_EVIDENCE_DATABASE_NAME === DATABASE,
  );
  const app = assertMountedEndpoint(
    process.env.OPERATIONS_MOUNTED_BROWSER_URL,
    '55612',
  );
  const backend = assertMountedEndpoint(
    process.env.PROJECT_EVIDENCE_POSTGREST_URL,
    '55610',
  );
  const controls = assertMountedEndpoint(
    process.env.PROJECT_EVIDENCE_CONTROL_URL,
    '55611',
  );
  const secret = process.env.PROJECT_EVIDENCE_JWT_SECRET,
    privateToken = process.env.PROJECT_EVIDENCE_CONTROL_TOKEN;
  assert(
    typeof secret === 'string' &&
      Buffer.byteLength(secret) >= 32 &&
      typeof privateToken === 'string' &&
      Buffer.byteLength(privateToken) >= 32 &&
      secret !== privateToken,
  );
  const raw = process.env.OPERATIONS_MOUNTED_BROWSER_SELECTORS;
  assert(typeof raw === 'string' && Buffer.byteLength(raw) < 16384);
  const selectors = validateMountedSelectors(JSON.parse(raw));
  const mode = process.env.OPERATIONS_MOUNTED_BROWSER_GATE_MODE;
  assert(['disabled', 'scope_only', 'enabled'].includes(mode));
  const { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  try {
    const before = await control(controls, privateToken, 'state');
    assert(before.databaseName === DATABASE);
    const test = await setupBrowser(
      browser,
      app,
      backend,
      secret,
      selectors.actorId,
      selectors,
    );
    contexts.push(test.context);
    diagnosticSource = test;
    const { page } = test;
    await page.goto(`${app}/project/${selectors.projectId}/economy`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await expect(
      page.getByRole('heading', {
        name: 'Isolerad ekonomiverifiering',
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    const scope = page.getByRole('region', { name: 'Sparat kostnadsunderlag' });
    if (mode === 'disabled') {
      phase = 'mounted default-off gates make no economic evidence request';
      await expect(
        page.getByText('Total kostnad', { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(scope).toHaveCount(0);
      assert(!test.observations.some((o) => o.kind !== 'table'));
      passed();
    } else {
      phase = 'actual mounted route reads genuine saved manual scope';
      await expect(scope).toBeVisible({ timeout: 30000 });
      await expect(
        scope.getByText('Sparad uppskattning', { exact: true }),
      ).toBeVisible();
      await expect(
        scope.getByText(
          'Prognos saknas. Budget och marginal kan ännu inte visas.',
          { exact: true },
        ),
      ).toBeVisible();
      assert(
        test.observations.some((o) => o.kind === 'scope' && o.status === 200),
      );
      passed();
      if (mode === 'scope_only') {
        phase =
          'independent leaf gate hides controls and never reads invoice details';
        await expect(scope.getByRole('button')).toHaveCount(0);
        assert(
          !test.observations.some(
            (o) => o.kind === 'leaf' || o.kind === 'unknown_leaf',
          ),
        );
        passed();
      } else {
        const costCard = page
          .getByText('Total kostnad', { exact: true })
          .locator('../..');
        await expect(costCard).toContainText(/700\s*kr/);
        const originalHeadline = await costCard.innerText();
        const detail = page.getByRole('region', { name: 'Kostnadspost' });
        phase =
          'displayed saved row opens genuine copied invoice without changing legacy total';
        failedBoundary = 'saved_row_click';
        await scope
          .getByRole('button', {
            name: `Visa detaljer för kostnadspost ${selectors.baselineRowIndex}`,
          })
          .click();
        failedBoundary = 'saved_copied_amount';
        await expect(
          detail.getByText(/Preliminär kostnad:\s*1\s*800,00\s*kr/),
        ).toBeVisible({ timeout: 30000 });
        failedBoundary = 'saved_leaf_receipt';
        assert(
          test.observations.some((o) => o.kind === 'leaf' && o.status === 200),
        );
        failedBoundary = 'saved_legacy_headline';
        await expect(costCard).toHaveText(originalHeadline);
        failedBoundary = 'unknown';
        passed();
        phase =
          'actual App persistence excludes loaded protected scope and leaf';
        await expect
          .poll(
            async () =>
              page.evaluate(() => {
                const raw = localStorage.getItem('lovable-rq-cache-v1');
                if (!raw) return false;
                const value = JSON.parse(raw),
                  queries = value.clientState?.queries;
                return (
                  Array.isArray(queries) &&
                  queries.some((q) => q.queryKey?.[0] === 'project') &&
                  queries.every(
                    (q) =>
                      ![
                        'operations-scope-obligation-evidence-v1',
                        'operations-obligation-drilldown-v1',
                      ].includes(q.queryKey?.[0]),
                  )
                );
              }),
            { timeout: 10000 },
          )
          .toBe(true);
        passed();
        phase = 'collapse removes selected saved details';
        await scope
          .getByRole('button', {
            name: `Dölj detaljer för kostnadspost ${selectors.baselineRowIndex}`,
          })
          .click();
        await expect(detail).toHaveCount(0);
        passed();
        phase =
          'unknown actual invoice source remains unavailable rather than zero';
        await scope
          .getByRole('button', {
            name: `Visa detaljer för kostnadspost ${selectors.unknownBaselineRowIndex}`,
          })
          .click();
        await expect(
          detail.getByText('Mottaget fakturaunderlag saknas.', { exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await expect(detail.getByText(/^0,00\s*kr$/)).toHaveCount(0);
        await expect(
          detail.getByText('Prognos, budget och marginal saknas.', {
            exact: true,
          }),
        ).toBeVisible();
        assert(
          test.observations.some(
            (o) => o.kind === 'unknown_leaf' && o.status === 200,
          ),
        );
        passed();
        phase =
          'live native scope poll clears selection and requires reopening';
        const priorReads = test.observations.filter(
          (o) => o.kind === 'scope',
        ).length;
        await expect
          .poll(
            () => test.observations.filter((o) => o.kind === 'scope').length,
            { timeout: 45000 },
          )
          .toBeGreaterThan(priorReads);
        await expect(
          scope.getByRole('button', {
            name: `Visa detaljer för kostnadspost ${selectors.unknownBaselineRowIndex}`,
          }),
        ).toBeVisible();
        await expect(detail).toHaveCount(0);
        passed();
        phase =
          'live profile organization change denies real API and hides copied private money';
        await scope
          .getByRole('button', {
            name: `Visa detaljer för kostnadspost ${selectors.baselineRowIndex}`,
          })
          .click();
        await expect(
          detail.getByText(/Preliminär kostnad:\s*1\s*800,00\s*kr/),
        ).toBeVisible({ timeout: 30000 });
        await control(controls, privateToken, 'move-admin-org');
        await expect
          .poll(
            () =>
              test.observations.some(
                (o) => o.kind === 'scope' && o.status === 403,
              ),
            { timeout: 45000 },
          )
          .toBe(true);
        await expect(
          scope.getByText(/Det sparade underlaget kunde inte hämtas/),
        ).toBeVisible();
        await expect(detail).toHaveCount(0);
        await control(controls, privateToken, 'restore-admin-org');
        passed();
        phase = 'foreign actual actor never mounts another tenant evidence';
        const foreign = await setupBrowser(
          browser,
          app,
          backend,
          secret,
          id(93),
          selectors,
        );
        contexts.push(foreign.context);
        diagnosticSource = foreign;
        await foreign.page.goto(
          `${app}/project/${selectors.projectId}/economy`,
          { waitUntil: 'domcontentloaded', timeout: 30000 },
        );
        await expect(
          foreign.page.getByText('Projektet hittades inte', { exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await expect(
          foreign.page.getByRole('region', { name: 'Sparat kostnadsunderlag' }),
        ).toHaveCount(0);
        assert(!foreign.observations.some((o) => o.kind !== 'table'));
        assert(!foreign.refusedWrites.length && !foreign.failures.length);
        passed();
        phase =
          'actual project user cannot elevate the mounted scope to administrator';
        const projectUser = await setupBrowser(
          browser,
          app,
          backend,
          secret,
          id(292),
          selectors,
        );
        contexts.push(projectUser.context);
        diagnosticSource = projectUser;
        await projectUser.page.goto(
          `${app}/project/${selectors.projectId}/economy`,
          { waitUntil: 'domcontentloaded', timeout: 30000 },
        );
        const forbiddenScope = projectUser.page.getByRole('region', {
          name: 'Sparat kostnadsunderlag',
        });
        await expect(
          forbiddenScope.getByText(/Det sparade underlaget kunde inte hämtas/),
        ).toBeVisible({ timeout: 30000 });
        assert(
          projectUser.observations.some(
            (o) => o.kind === 'scope' && o.status === 403,
          ),
        );
        await expect(
          projectUser.page.getByRole('region', { name: 'Kostnadspost' }),
        ).toHaveCount(0);
        assert(
          !projectUser.refusedWrites.length && !projectUser.failures.length,
        );
        passed();
        phase = 'native admin role revocation denies fresh mounted scope read';
        diagnosticSource = test;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await expect(scope).toBeVisible({ timeout: 30000 });
        await scope
          .getByRole('button', {
            name: `Visa detaljer för kostnadspost ${selectors.baselineRowIndex}`,
          })
          .click();
        await expect(
          detail.getByText(/Preliminär kostnad:\s*1\s*800,00\s*kr/),
        ).toBeVisible({ timeout: 30000 });
        const deniedBefore = test.observations.filter(
          (o) => o.kind === 'scope' && o.status === 403,
        ).length;
        await control(controls, privateToken, 'revoke-admin');
        await expect
          .poll(
            () =>
              test.observations.filter(
                (o) => o.kind === 'scope' && o.status === 403,
              ).length,
            { timeout: 45000 },
          )
          .toBeGreaterThan(deniedBefore);
        await expect(
          scope.getByText(/Det sparade underlaget kunde inte hämtas/),
        ).toBeVisible();
        await expect(detail).toHaveCount(0);
        passed();
      }
    }
    phase =
      'actual route journey sends no financial writes and preserves saved evidence';
    diagnosticSource = test;
    failedBoundary = 'writes';
    assert(test.refusedWrites.length === 0);
    failedBoundary = 'forward';
    assert(test.failures.length === 0);
    failedBoundary = 'evidence_state';
    const after = await control(controls, privateToken, 'state');
    assert(JSON.stringify(before) === JSON.stringify(after));
    passed();
    console.log(
      JSON.stringify({
        result: 'PASS',
        cases: count,
        gateMode: mode,
        scope:
          'actual product route browser with native signed fixture JWT/PostgREST; received evidence only',
      }),
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch {
    console.error(
      JSON.stringify({
        result: 'FAIL',
        case: phase,
        reason: 'mounted browser proof failed',
        boundary: failedBoundary,
        ...mountedFailureCounts(
          diagnosticSource?.refusedWrites ?? [],
          diagnosticSource?.failures ?? [],
        ),
      }),
    );
    process.exitCode = 1;
  }
}
