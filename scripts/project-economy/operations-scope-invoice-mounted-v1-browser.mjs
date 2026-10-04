// TEST ONLY: prepared genuine-App journey, hardblocked until reviewed product/native admission.
// No readiness environment flag, fabricated financial response, TEST publisher or prior8 inheritance.
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  assertMountedEndpoint,
  allowedMountedRead,
  classifyMountedWrite,
} from "./operations-obligation-mounted-browser.mjs";
import {
  validateScopeInvoiceState,
  scopeInvoiceStatePreimage,
} from "./operations-scope-invoice-mounted-v1-state.mjs";
const ORIGIN = "https://pihrhltinhewhoxefjxv.supabase.co";
const PARENT = "/rest/v1/rpc/read_operations_scope_obligation_evidence_v1";
const CHILD = "/rest/v1/rpc/read_operations_scope_invoice_capture_admin_v1";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const check = (value) => {
  if (!value) throw new Error("scope invoice mounted v1 boundary");
};
function exact(value, keys) {
  check(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
  return value;
}
export function scopeInvoiceMountedV1Availability() {
  return Object.freeze({
    result: "BLOCKED",
    gateMode: "scope_invoice_capture",
    reason: "genuine_product_source_native_acl_jwt_queue_api_proof_required",
    accepted_cases: 0,
  });
}
export function validateScopeInvoiceMountedV1Selectors(value) {
  const x = exact(value, [
    "schema",
    "organizationId",
    "actorId",
    "rootKind",
    "rootId",
    "compositionSnapshotId",
  ]);
  check(
    x.schema === "operations-scope-invoice-mounted-v1-selectors.v1" &&
      x.organizationId === id(1) &&
      x.actorId === id(199) &&
      x.rootKind === "project" &&
      x.rootId === id(1017),
  );
  check(
    typeof x.compositionSnapshotId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        x.compositionSnapshotId,
      ),
  );
  return x;
}
export function allowedScopeInvoiceMountedV1Read(url, method) {
  const u = new URL(url);
  if (u.origin !== ORIGIN || u.username || u.password || u.hash) return false;
  if (method === "GET") return allowedMountedRead(url, "GET");
  if (method === "OPTIONS")
    return (
      !u.search &&
      (u.pathname === PARENT ||
        u.pathname === CHILD ||
        allowedMountedRead(url, "GET"))
    );
  return (
    method === "POST" &&
    !u.search &&
    (u.pathname === PARENT || u.pathname === CHILD)
  );
}
export function validateScopeInvoiceMountedV1Rpc(path, raw, selectors) {
  validateScopeInvoiceMountedV1Selectors(selectors);
  check(typeof raw === "string" && Buffer.byteLength(raw) <= 262144);
  const body = JSON.parse(raw);
  if (path === PARENT) {
    const p = exact(body, ["p_organization_id", "p_root_kind", "p_root_id"]);
    check(
      p.p_organization_id === selectors.organizationId &&
        p.p_root_kind === selectors.rootKind &&
        p.p_root_id === selectors.rootId,
    );
    return "scope_parent";
  }
  check(path === CHILD);
  const p = exact(exact(body, ["p_request"]).p_request, [
    "schema_version",
    "root_kind",
    "root_id",
    "expected_composition_snapshot_id",
  ]);
  check(
    p.schema_version === "operations-scope-invoice-capture-admin-read.v1" &&
      p.root_kind === selectors.rootKind &&
      p.root_id === selectors.rootId &&
      p.expected_composition_snapshot_id === selectors.compositionSnapshotId,
  );
  return "scope_invoice";
}
export const SCOPE_INVOICE_MOUNTED_V1_CASES = Object.freeze([
  "actual accepted parent mounts copied partial scope invoice evidence",
  "copied scope invoice leaves saved manual evidence and legacy headline unchanged",
  "actual App persistence excludes loaded scope invoice and parent evidence",
  "actual project member cannot mount an admin whole-scope invoice view",
  "foreign actual actor cannot mount another tenant scope invoice evidence",
  "live profile organization change removes cached whole-scope invoice money",
  "native admin revocation removes fresh whole-scope invoice evidence",
  "actual scope invoice journey preserves full48 financial state with no writes or forwarding failures",
]);
function sign(secret, actor) {
  const b = (value) => Buffer.from(JSON.stringify(value)).toString("base64url"),
    now = Math.floor(Date.now() / 1000);
  const raw = `${b({ alg: "HS256", typ: "JWT" })}.${b({ role: "authenticated", sub: actor, iat: now, exp: now + 600 })}`;
  return `${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`;
}
// One monotonic budget spans fetch headers AND streamed body; late bodies are cancelled.
export async function boundedScopeInvoiceMountedV1Response(
  makeResponse,
  milliseconds = 15000,
) {
  check(
    typeof makeResponse === "function" &&
      Number.isSafeInteger(milliseconds) &&
      milliseconds > 0 &&
      milliseconds <= 15000,
  );
  const controller = new AbortController(),
    started = performance.now();
  let expired = false,
    reader,
    timer,
    response;
  const fresh = () =>
    check(!expired && performance.now() - started < milliseconds);
  const stop = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      reject(new Error("scope invoice whole response deadline"));
    }, milliseconds);
  });
  try {
    const pending = Promise.resolve()
      .then(() => makeResponse(controller.signal))
      .then((response) => {
        if (expired || performance.now() - started >= milliseconds) {
          expired = true;
          if (response.body) void response.body.cancel().catch(() => {});
          throw new Error("scope invoice late response");
        }
        return response;
      });
    response = await Promise.race([pending, stop]);
    fresh();
    if (!response.body) return { response, body: Buffer.alloc(0) };
    reader = response.body.getReader();
    const parts = [];
    let bytes = 0,
      chunks = 0;
    while (true) {
      fresh();
      const result = await Promise.race([reader.read(), stop]);
      fresh();
      if (result.done) break;
      check(++chunks <= 4096);
      if (!result.value.byteLength) continue;
      bytes += result.value.byteLength;
      check(bytes <= 2097152);
      parts.push(Buffer.from(result.value));
    }
    fresh();
    return { response, body: Buffer.concat(parts, bytes) };
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
// All owned close attempts are scheduled and inspected even if a peer rejects or hangs.
export async function cleanupScopeInvoiceMountedV1(
  contexts,
  browser,
  milliseconds = 5000,
) {
  check(
    Array.isArray(contexts) &&
      browser &&
      Number.isSafeInteger(milliseconds) &&
      milliseconds > 0 &&
      milliseconds <= 5000,
  );
  let timer;
  const attempts = [
    ...contexts.map((context) => Promise.resolve().then(() => context.close())),
    Promise.resolve().then(() => browser.close()),
  ];
  try {
    const results = await Promise.race([
      Promise.allSettled(attempts),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("scope invoice cleanup deadline")),
          milliseconds,
        );
      }),
    ]);
    check(results.every((result) => result.status === "fulfilled"));
  } finally {
    clearTimeout(timer);
  }
}
// Private fixed controller preparation. It will require a separately reviewed root integration.
async function control(base, token, operation) {
  check(
    ["state", "move-admin-org", "restore-admin-org", "revoke-admin"].includes(
      operation,
    ),
  );
  const read = operation === "state",
    key = `scope-invoice-mounted-v1/${operation}`;
  const { response, body } = await boundedScopeInvoiceMountedV1Response(
    (signal) =>
      fetch(`${base}/${key}`, {
        method: read ? "GET" : "POST",
        redirect: "error",
        signal,
        headers: {
          "x-project-evidence-control-token": token,
          ...(!read ? { "Content-Type": "application/json" } : {}),
        },
        ...(!read
          ? {
              body: JSON.stringify({
                fixture: "operations-scope-invoice-mounted-v1",
              }),
            }
          : {}),
      }),
  );
  check(response.status === 200);
  const data = JSON.parse(body.toString("utf8"));
  if (read) return validateScopeInvoiceState(data);
  exact(data, ["status", "operation"]);
  check(data.status === "accepted" && data.operation === key);
  return data;
}
async function setup(
  browser,
  app,
  backend,
  secret,
  actor,
  selectors,
  contexts,
) {
  const token = sign(secret, actor),
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    }),
    reads = [],
    writes = [],
    failures = [];
  contexts.push(context);
  await context.routeWebSocket("**", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      method = req.method();
    if (u.origin === app && ["GET", "HEAD"].includes(method))
      return route.continue();
    if (!allowedScopeInvoiceMountedV1Read(req.url(), method)) {
      if (!["GET", "HEAD", "OPTIONS"].includes(method))
        writes.push(classifyMountedWrite(req.url(), app));
      return route.abort("blockedbyclient");
    }
    try {
      const headers = await req.allHeaders();
      if (method !== "OPTIONS")
        check(headers.authorization === `Bearer ${token}`);
      const kind =
        method === "POST"
          ? validateScopeInvoiceMountedV1Rpc(
              u.pathname,
              req.postData(),
              selectors,
            )
          : method === "OPTIONS"
            ? "preflight"
            : "table";
      const { response, body } = await boundedScopeInvoiceMountedV1Response(
        (signal) =>
          fetch(`${backend}${u.pathname.slice("/rest/v1".length)}${u.search}`, {
            method,
            redirect: "error",
            signal,
            headers,
            ...(method === "POST" ? { body: req.postDataBuffer() } : {}),
          }),
      );
      const h = Object.fromEntries(response.headers.entries());
      for (const key of [
        "content-encoding",
        "transfer-encoding",
        "content-length",
      ])
        delete h[key];
      // Native response bytes/status pass through unchanged. The actual App runs its strict parser.
      if (method !== "OPTIONS") reads.push({ kind, status: response.status });
      await route.fulfill({ status: response.status, headers: h, body });
    } catch {
      failures.push("native_forward");
      await route.abort("failed");
    }
  });
  await context.addInitScript(
    ({ token, actor }) =>
      localStorage.setItem(
        "eventflow-planning-auth",
        JSON.stringify({
          access_token: token,
          refresh_token: "isolated-unused-refresh-token",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 600,
          expires_in: 600,
          user: {
            id: actor,
            aud: "authenticated",
            role: "authenticated",
            email: "isolated@example.invalid",
            app_metadata: { provider: "email" },
            user_metadata: {},
            created_at: "2026-10-02T00:00:00Z",
          },
        }),
      ),
    { token, actor },
  );
  return { context, page: await context.newPage(), reads, writes, failures };
}
// This body is intentionally unreachable until a reviewed source change installs genuine admission.
// It must not be exported as a way around the blocked entry, or accept caller-supplied readiness.
async function executeAdmittedScopeInvoiceMountedV1() {
  check(
    process.env.CI === "true" &&
      process.env.ISOLATED_PROJECT_EVIDENCE_HTTP === "true" &&
      process.env.PROJECT_EVIDENCE_DATABASE_NAME ===
        "eventflow_project_evidence_http_runtime" &&
      process.env.OPERATIONS_MOUNTED_BROWSER_GATE_MODE ===
        "scope_invoice_capture",
  );
  const app = assertMountedEndpoint(
      process.env.OPERATIONS_MOUNTED_BROWSER_URL,
      "55612",
    ),
    backend = assertMountedEndpoint(
      process.env.PROJECT_EVIDENCE_POSTGREST_URL,
      "55610",
    ),
    controls = assertMountedEndpoint(
      process.env.PROJECT_EVIDENCE_CONTROL_URL,
      "55611",
    );
  const secret = process.env.PROJECT_EVIDENCE_JWT_SECRET,
    privateToken = process.env.PROJECT_EVIDENCE_CONTROL_TOKEN;
  check(
    typeof secret === "string" &&
      Buffer.byteLength(secret) >= 32 &&
      typeof privateToken === "string" &&
      Buffer.byteLength(privateToken) >= 32 &&
      secret !== privateToken,
  );
  const raw = process.env.OPERATIONS_SCOPE_INVOICE_MOUNTED_V1_SELECTORS;
  check(typeof raw === "string" && Buffer.byteLength(raw) < 16384);
  const selectors = validateScopeInvoiceMountedV1Selectors(JSON.parse(raw)),
    { chromium, expect } = await import("@playwright/test"),
    browser = await chromium.launch({ headless: true }),
    contexts = [],
    all = [];
  let accepted = 0;
  const pass = () => {
    console.log(
      JSON.stringify({
        case: SCOPE_INVOICE_MOUNTED_V1_CASES[accepted],
        result: "PASS",
      }),
    );
    accepted++;
  };
  const visit = (t) =>
    t.page.goto(`${app}/project/${selectors.rootId}/economy`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  const scope = (t) =>
      t.page.getByRole("region", { name: "Sparat kostnadsunderlag" }),
    invoice = (t) =>
      t.page.getByRole("region", {
        name: "Fakturaunderlag för projektsamlingen",
      });
  try {
    const before = await control(controls, privateToken, "state");
    const t = await setup(
      browser,
      app,
      backend,
      secret,
      selectors.actorId,
      selectors,
      contexts,
    );
    all.push(t);
    await visit(t);
    await expect(
      t.page.getByRole("heading", {
        name: "Isolerad ekonomiverifiering",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      invoice(t).getByRole("heading", {
        name: "Känt fakturaunderlag",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      invoice(t)
        .getByText("Känt mottaget fakturabelopp", { exact: true })
        .locator("xpath=following-sibling::dd[1]"),
    ).toHaveText(/^1\s*800,00\s*kr$/);
    await expect(
      invoice(t).getByText("Prognos, budget och marginal saknas.", {
        exact: true,
      }),
    ).toBeVisible();
    check(
      t.reads.some((r) => r.kind === "scope_parent" && r.status === 200) &&
        t.reads.some((r) => r.kind === "scope_invoice" && r.status === 200),
    );
    pass();
    const card = t.page
      .getByText("Total kostnad", { exact: true })
      .locator("../..");
    await expect(card).toContainText(/700\s*kr/);
    const headline = await card.innerText();
    await expect(
      scope(t).getByText("Sparad uppskattning", { exact: true }),
    ).toBeVisible();
    await expect(
      scope(t).getByText("Sparade åtaganden", { exact: true }),
    ).toBeVisible();
    await expect(card).toHaveText(headline, { useInnerText: true });
    pass();
    await expect
      .poll(
        () =>
          t.page.evaluate(() => {
            const raw = localStorage.getItem("lovable-rq-cache-v1");
            if (!raw) return false;
            const q = JSON.parse(raw).clientState?.queries;
            return (
              Array.isArray(q) &&
              q.some((x) => x.queryKey?.[0] === "project") &&
              q.every(
                (x) =>
                  ![
                    "operations-scope-invoice-capture-v1",
                    "operations-scope-obligation-evidence-v1",
                  ].includes(x.queryKey?.[0]),
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
      contexts,
    );
    all.push(member);
    await visit(member);
    await expect
      .poll(
        () =>
          member.reads.some(
            (r) => r.kind === "scope_parent" && r.status === 403,
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await expect(invoice(member)).toHaveCount(0);
    check(!member.reads.some((r) => r.kind === "scope_invoice"));
    pass();
    const foreign = await setup(
      browser,
      app,
      backend,
      secret,
      id(93),
      selectors,
      contexts,
    );
    all.push(foreign);
    await visit(foreign);
    await expect(
      foreign.page.getByText("Projektet hittades inte", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    check(!foreign.reads.some((r) => r.kind === "scope_invoice"));
    pass();
    await control(controls, privateToken, "move-admin-org");
    await expect
      .poll(
        () =>
          t.reads.some((r) => r.kind === "scope_parent" && r.status === 403),
        { timeout: 45000 },
      )
      .toBe(true);
    await expect(invoice(t)).toHaveCount(0);
    await control(controls, privateToken, "restore-admin-org");
    pass();
    await t.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(
      invoice(t)
        .getByText("Känt mottaget fakturabelopp", { exact: true })
        .locator("xpath=following-sibling::dd[1]"),
    ).toHaveText(/^1\s*800,00\s*kr$/, { timeout: 30000 });
    const denied = t.reads.filter(
      (r) => r.kind === "scope_parent" && r.status === 403,
    ).length;
    await control(controls, privateToken, "revoke-admin");
    await expect
      .poll(
        () =>
          t.reads.filter((r) => r.kind === "scope_parent" && r.status === 403)
            .length,
        { timeout: 45000 },
      )
      .toBeGreaterThan(denied);
    await expect(invoice(t)).toHaveCount(0);
    pass();
    for (const session of all)
      check(session.writes.length === 0 && session.failures.length === 0);
    check(
      scopeInvoiceStatePreimage(before) ===
        scopeInvoiceStatePreimage(
          await control(controls, privateToken, "state"),
        ),
    );
    await expect(card).toContainText(/700\s*kr/);
    pass();
    check(accepted === SCOPE_INVOICE_MOUNTED_V1_CASES.length);
  } finally {
    await cleanupScopeInvoiceMountedV1(contexts, browser);
  }
  // Only emit final journey PASS after every owned context and browser close succeeded.
  console.log(
    JSON.stringify({
      result: "PASS",
      gateMode: "scope_invoice_capture",
      cases: accepted,
      scope:
        "actual App/native signed synthetic JWT/PostgREST; received partial evidence only",
    }),
  );
}
export async function runScopeInvoiceMountedV1() {
  // No property of process.env, endpoint, credential or browser dependency is read before BLOCKED.
  const blocked = scopeInvoiceMountedV1Availability();
  console.log(JSON.stringify(blocked));
  return 78;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = await runScopeInvoiceMountedV1();
