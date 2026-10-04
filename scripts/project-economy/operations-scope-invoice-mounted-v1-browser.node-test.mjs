// Pure boundaries and zero-network blocked admission; no native/browser acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  boundedScopeInvoiceMountedV1Response,
  cleanupScopeInvoiceMountedV1,
  scopeInvoiceMountedV1Availability,
  validateScopeInvoiceMountedV1Selectors,
  allowedScopeInvoiceMountedV1Read,
  validateScopeInvoiceMountedV1Rpc,
  SCOPE_INVOICE_MOUNTED_V1_CASES,
} from "./operations-scope-invoice-mounted-v1-browser.mjs";
import {
  scopeInvoiceMountedV1ControlOperation,
  scopeInvoiceMountedV1Mutations,
  SCOPE_INVOICE_MOUNTED_STATE_SQL,
} from "./operations-scope-invoice-mounted-v1-controls.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const selectors = () => ({
  schema: "operations-scope-invoice-mounted-v1-selectors.v1",
  organizationId: id(1),
  actorId: id(199),
  rootKind: "project",
  rootId: id(1017),
  compositionSnapshotId: id(1090),
});
const parent = "/rest/v1/rpc/read_operations_scope_obligation_evidence_v1",
  child = "/rest/v1/rpc/read_operations_scope_invoice_capture_admin_v1",
  origin = "https://pihrhltinhewhoxefjxv.supabase.co";
const parentBody = () => ({
  p_organization_id: id(1),
  p_root_kind: "project",
  p_root_id: id(1017),
});
const childBody = () => ({
  p_request: {
    schema_version: "operations-scope-invoice-capture-admin-read.v1",
    root_kind: "project",
    root_id: id(1017),
    expected_composition_snapshot_id: id(1090),
  },
});
test("hard blocked entry ignores fake readiness and exits78 before credential/network/browser work", () => {
  assert.deepEqual(scopeInvoiceMountedV1Availability(), {
    result: "BLOCKED",
    gateMode: "scope_invoice_capture",
    reason: "genuine_product_source_native_acl_jwt_queue_api_proof_required",
    accepted_cases: 0,
  });
  const file = fileURLToPath(
    new URL(
      "./operations-scope-invoice-mounted-v1-browser.mjs",
      import.meta.url,
    ),
  );
  const result = spawnSync(process.execPath, [file], {
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 4096,
    env: {
      PATH: process.env.PATH,
      CI: "true",
      PRODUCT_NATIVE_READY: "true",
      OPERATIONS_SCOPE_INVOICE_READY: "true",
      PROJECT_EVIDENCE_CONTROL_TOKEN: "PRIVATE_NOT_OUTPUT",
      PROJECT_EVIDENCE_JWT_SECRET: "PRIVATE_NOT_OUTPUT",
      OPERATIONS_MOUNTED_BROWSER_URL: "https://example.invalid",
    },
  });
  assert.equal(result.status, 78);
  assert.deepEqual(
    JSON.parse(result.stdout),
    scopeInvoiceMountedV1Availability(),
  );
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /PRIVATE|PASS/);
});
test("exact selectors/request bind only genuine displayed project composition and actual ABIs", () => {
  const s = selectors();
  assert.equal(validateScopeInvoiceMountedV1Selectors(s), s);
  assert.equal(
    validateScopeInvoiceMountedV1Rpc(parent, JSON.stringify(parentBody()), s),
    "scope_parent",
  );
  assert.equal(
    validateScopeInvoiceMountedV1Rpc(child, JSON.stringify(childBody()), s),
    "scope_invoice",
  );
  for (const delta of [
    { actorId: id(292) },
    { organizationId: id(99) },
    { rootKind: "large_project" },
    { rootId: id(117) },
    { compositionSnapshotId: ["fake"] },
    { extra: true },
  ])
    assert.throws(() =>
      validateScopeInvoiceMountedV1Selectors({ ...s, ...delta }),
    );
  for (const mutate of [
    (p) => (p.p_request.root_id = id(117)),
    (p) => (p.p_request.root_kind = "packing_project"),
    (p) => (p.p_request.expected_composition_snapshot_id = id(1091)),
    (p) => (p.p_request.actor_id = id(199)),
    (p) => (p.p_request.organization_id = id(1)),
  ]) {
    const body = childBody();
    mutate(body);
    assert.throws(() =>
      validateScopeInvoiceMountedV1Rpc(child, JSON.stringify(body), s),
    );
  }
  assert.throws(() =>
    validateScopeInvoiceMountedV1Rpc(
      parent,
      JSON.stringify({ ...parentBody(), p_organization_id: id(99) }),
      s,
    ),
  );
  assert.throws(() =>
    validateScopeInvoiceMountedV1Rpc(child, " ".repeat(262145), s),
  );
});
test("only exact parent/admin readPOSTs admitted, all financial/Edge/auth writes still denied", () => {
  assert.equal(allowedScopeInvoiceMountedV1Read(origin + parent, "POST"), true);
  assert.equal(allowedScopeInvoiceMountedV1Read(origin + child, "POST"), true);
  for (const url of [
    origin + child + "?x=1",
    origin + child + "#x",
    origin + "/rest/v1/rpc/read_operations_scope_invoice_kernel_evidence_v1",
    origin + "/rest/v1/rpc/append_operations_manual_obligation_baseline_v1",
    origin + "/functions/v1/report-diagnostic",
    origin + "/functions/v1/mapbox-token",
    origin + "/auth/v1/logout",
    "https://foreign.invalid" + child,
  ])
    assert.equal(allowedScopeInvoiceMountedV1Read(url, "POST"), false);
  assert.equal(allowedScopeInvoiceMountedV1Read(origin + child, "GET"), false);
  assert.equal(
    allowedScopeInvoiceMountedV1Read(origin + child, "DELETE"),
    false,
  );
});
test("fixed private controls cannot supply arbitrary SQL, identity, body, route or economic writes", () => {
  assert.deepEqual(
    scopeInvoiceMountedV1ControlOperation(
      "GET",
      "/scope-invoice-mounted-v1/state",
      "",
    ),
    { kind: "state", sqlPath: SCOPE_INVOICE_MOUNTED_STATE_SQL },
  );
  for (const operation of Object.keys(scopeInvoiceMountedV1Mutations))
    assert.deepEqual(
      scopeInvoiceMountedV1ControlOperation(
        "POST",
        "/" + operation,
        JSON.stringify({ fixture: "operations-scope-invoice-mounted-v1" }),
      ),
      { kind: "mutation", operation },
    );
  for (const args of [
    ["POST", "/scope-invoice-mounted-v1/state", "{}"],
    ["GET", "/scope-invoice-mounted-v1/state", "PRIVATE"],
    ["POST", "/scope-invoice-mounted-v1/enable-gate", "{}"],
    ["POST", "/drilldown/revoke-admin", "{}"],
    [
      "POST",
      "/scope-invoice-mounted-v1/revoke-admin",
      JSON.stringify({
        fixture: "operations-scope-invoice-mounted-v1",
        sql: "drop table",
      }),
    ],
    [
      "POST",
      "/scope-invoice-mounted-v1/revoke-admin",
      JSON.stringify({ fixture: "project-evidence-drilldown-http-v1" }),
    ],
  ])
    assert.throws(() => scopeInvoiceMountedV1ControlOperation(...args));
  assert.equal(Object.keys(scopeInvoiceMountedV1Mutations).length, 3);
  for (const sql of Object.values(scopeInvoiceMountedV1Mutations))
    assert.doesNotMatch(
      sql,
      /\b(update|insert into|delete from) public\.operations_|project_purchases|amount=/i,
    );
});
test("prepared real route source retains strict bearer/body forwarding, disk exclusion, state and unknown-money guards", () => {
  assert.equal(SCOPE_INVOICE_MOUNTED_V1_CASES.length, 8);
  const source = readFileSync(
    new URL(
      "./operations-scope-invoice-mounted-v1-browser.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /route\.fulfill\(\{\s*status: response\.status,\s*headers: h,\s*body,?\s*\}\)/,
  );
  assert.match(source, /headers\.authorization === `Bearer \$\{token\}`/);
  assert.match(
    source,
    /session\.writes\.length === 0 && session\.failures\.length === 0/,
  );
  assert.match(source, /Prognos, budget och marginal saknas\./);
  assert.match(source, /operations-scope-invoice-capture-v1/);
  assert.match(source, /scopeInvoiceStatePreimage\(before\)/);
  assert.doesNotMatch(
    source,
    /export (async )?function executeAdmittedScopeInvoiceMountedV1/,
  );
});

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
test("one monotonic fetch/body deadline cannot restart after delayed headers", async () => {
  let cancelled = 0,
    signal;
  await assert.rejects(() =>
    boundedScopeInvoiceMountedV1Response(async (receivedSignal) => {
      signal = receivedSignal;
      await delay(30);
      return new Response(
        new ReadableStream(
          {
            async pull(controller) {
              await delay(30);
              if (!signal.aborted) {
                controller.enqueue(new Uint8Array([1]));
                controller.close();
              }
            },
            cancel() {
              cancelled++;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    }, 45),
  );
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, 1);
});
test("abort-ignoring late response body is cancelled without ever pulling private bytes", async () => {
  let cancelled = 0,
    pulls = 0;
  await assert.rejects(() =>
    boundedScopeInvoiceMountedV1Response(async () => {
      await delay(25);
      return new Response(
        new ReadableStream(
          {
            pull() {
              pulls++;
            },
            cancel() {
              cancelled++;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    }, 10),
  );
  await delay(35);
  assert.equal(cancelled, 1);
  assert.equal(pulls, 0);
});
test("body/chunk bounds reject oversized or empty-microtask streams", async () => {
  await assert.rejects(() =>
    boundedScopeInvoiceMountedV1Response(
      () => new Response(new Uint8Array(2097153)),
    ),
  );
  let cancelled = 0;
  await assert.rejects(() =>
    boundedScopeInvoiceMountedV1Response(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(0));
            },
            cancel() {
              cancelled++;
            },
          }),
        ),
    ),
  );
  assert.equal(cancelled, 1);
});
test("all owned cleanup attempts execute despite rejection or hung peer; no final PASS precedes cleanup", async () => {
  const called = [];
  await assert.rejects(() =>
    cleanupScopeInvoiceMountedV1(
      [
        {
          close() {
            called.push("first");
            throw new Error("private");
          },
        },
        {
          close() {
            called.push("second");
            return Promise.resolve();
          },
        },
      ],
      {
        close() {
          called.push("browser");
          return Promise.resolve();
        },
      },
    ),
  );
  assert.deepEqual(called, ["first", "second", "browser"]);
  const hungCalls = [];
  await assert.rejects(() =>
    cleanupScopeInvoiceMountedV1(
      [
        {
          close() {
            hungCalls.push("hung");
            return new Promise(() => {});
          },
        },
      ],
      {
        close() {
          hungCalls.push("browser");
          return Promise.resolve();
        },
      },
      15,
    ),
  );
  assert.deepEqual(hungCalls, ["hung", "browser"]);
  await cleanupScopeInvoiceMountedV1(
    [
      {
        close() {
          return Promise.resolve();
        },
      },
    ],
    {
      close() {
        return Promise.resolve();
      },
    },
  );
  const source = readFileSync(
    new URL(
      "./operations-scope-invoice-mounted-v1-browser.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    source.indexOf("await cleanupScopeInvoiceMountedV1(contexts, browser)") <
      source.indexOf("// Only emit final journey PASS"),
  );
});
