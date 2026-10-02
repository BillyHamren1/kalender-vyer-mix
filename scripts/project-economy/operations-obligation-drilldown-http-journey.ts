// Real signed fixture JWT/PostgREST requests. No response/client mocks or service JWT reads.
import { validateObligationDrilldown } from "../../src/lib/economy/projectScopeObligationDrilldown.ts";
import type { ScopeRootKind } from "../../src/lib/economy/projectScopeObligationEvidence.ts";
const database = "eventflow_project_evidence_http_runtime";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Request = {
  schema_version: "operations-scope-obligation-drilldown-read.v1";
  root_kind: ScopeRootKind;
  root_id: string;
  obligation_id: string;
  expected_composition_snapshot_id: string;
  expected_baseline_event_id: string;
};
let phase = "drilldown isolated guard";
let passed = 0;
function requireTrue(v: unknown): asserts v {
  if (!v) throw new Error("Authenticated drilldown proof failed");
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function exact(v: unknown, keys: string[]): Record<string, unknown> {
  requireTrue(v && typeof v === "object" && !Array.isArray(v));
  const x = v as Record<string, unknown>;
  requireTrue(
    Object.keys(x).length === keys.length &&
      keys.every((k) => Object.hasOwn(x, k)),
  );
  return x;
}
export function assertDrilldownEndpoint(
  v: string | undefined,
  expectedPort: "55610" | "55611",
): string {
  requireTrue(typeof v === "string");
  const u = new URL(v);
  requireTrue(
    u.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && !u.username &&
      !u.password && !u.search && !u.hash && u.pathname === "/" &&
      u.port === expectedPort,
  );
  return u.origin;
}
const b64 = (v: Uint8Array) =>
  btoa(String.fromCharCode(...v)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
async function token(secret: string, sub: string | null) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = b64(
    new TextEncoder().encode(
      JSON.stringify({
        role: "authenticated",
        ...(sub ? { sub } : {}),
        iat: now,
        exp: now + 600,
      }),
    ),
  );
  const raw = `${head}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${raw}.${
    b64(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
    )
  }`;
}
async function boundedJson(
  response: Response,
  started: number,
): Promise<unknown> {
  requireTrue(performance.now() - started < 15000 && response.body);
  const reader = response.body.getReader();
  let bytes = 0, chunks = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      requireTrue(performance.now() - started < 15000);
      const r = await reader.read();
      requireTrue(performance.now() - started < 15000);
      if (r.done) break;
      requireTrue(++chunks <= 4096);
      if (!r.value.byteLength) continue;
      bytes += r.value.byteLength;
      requireTrue(bytes <= 2097152);
      parts.push(r.value);
    }
    const raw = new Uint8Array(bytes);
    let offset = 0;
    for (const p of parts) {
      raw.set(p, offset);
      offset += p.byteLength;
    }
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
    requireTrue(performance.now() - started < 15000);
    return parsed;
  } finally {
    void reader.cancel().catch(() => {});
  }
}
async function request(url: string, init: RequestInit) {
  const started = performance.now();
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    data: await boundedJson(response, started),
  };
}
async function rpc(base: string, jwt: string, name: string, args: unknown) {
  requireTrue(
    [
      "read_operations_scope_obligation_drilldown_v1",
      "read_operations_catering_project_evidence_v3",
    ].includes(name),
  );
  return await request(`${base}/rpc/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
}
async function control(base: string, secret: string, operation: string) {
  requireTrue(
    [
      "state",
      "move-admin-org",
      "restore-admin-org",
      "delete-project-a",
      "revoke-admin",
      "revoke-packing-policy",
    ].includes(operation),
  );
  const state = operation === "state";
  const r = await request(`${base}/drilldown/${operation}`, {
    method: state ? "GET" : "POST",
    headers: {
      "x-project-evidence-control-token": secret,
      ...(state ? {} : { "Content-Type": "application/json" }),
    },
    ...(state ? {} : {
      body: JSON.stringify({ fixture: "project-evidence-drilldown-http-v1" }),
    }),
  });
  requireTrue(r.status === 200);
  if (!state) {
    const result = exact(r.data, ["status", "operation"]);
    requireTrue(
      result.status === "accepted" &&
        result.operation === `/drilldown/${operation}`,
    );
  }
  return r.data;
}
const countKeys = [
  "databaseName",
  "cateringPublications",
  "cateringObservations",
  "cateringOutbox",
  "invoiceSnapshots",
  "baselines",
  "bindings",
  "sourcePolicies",
  "compositions",
];
function counts(v: unknown) {
  const x = exact(v, countKeys);
  requireTrue(x.databaseName === database);
  for (const k of countKeys.slice(1)) {
    requireTrue(
      typeof x[k] === "number" && Number.isSafeInteger(x[k]) &&
        (x[k] as number) >= 0,
    );
  }
  return x;
}
function done() {
  passed++;
  console.log(JSON.stringify({ case: phase, result: "PASS" }));
}
async function main() {
  requireTrue(
    Deno.env.get("CI") === "true" &&
      Deno.env.get("ISOLATED_PROJECT_EVIDENCE_HTTP") === "true" &&
      Deno.env.get("PROJECT_EVIDENCE_DATABASE_NAME") === database,
  );
  const base = assertDrilldownEndpoint(
    Deno.env.get("PROJECT_EVIDENCE_POSTGREST_URL"),
    "55610",
  );
  const controls = assertDrilldownEndpoint(
    Deno.env.get("PROJECT_EVIDENCE_CONTROL_URL"),
    "55611",
  );
  const secret = Deno.env.get("PROJECT_EVIDENCE_JWT_SECRET");
  const privateToken = Deno.env.get("PROJECT_EVIDENCE_CONTROL_TOKEN");
  requireTrue(
    typeof secret === "string" &&
      new TextEncoder().encode(secret).byteLength >= 32 &&
      typeof privateToken === "string" &&
      new TextEncoder().encode(privateToken).byteLength >= 32 &&
      secret !== privateToken,
  );
  const raw = Deno.env.get("PROJECT_EVIDENCE_DRILLDOWN_SELECTORS");
  requireTrue(
    typeof raw === "string" && new TextEncoder().encode(raw).byteLength < 16384,
  );
  const selectors = exact(JSON.parse(raw), [
    "schema",
    "organizationId",
    "actorId",
    "requests",
  ]);
  requireTrue(
    selectors.schema === "operations-obligation-drilldown-http-selectors.v1" &&
      selectors.organizationId === id(1) && selectors.actorId === id(199),
  );
  const keys = [
    "project",
    "large",
    "packing",
    "baselineChanged",
    "superseded",
    "membershipChanged",
  ];
  const requests = exact(selectors.requests, keys) as unknown as Record<
    string,
    Request
  >;
  for (const [i, label] of keys.entries()) {
    const q = exact(requests[label], [
      "schema_version",
      "root_kind",
      "root_id",
      "obligation_id",
      "expected_composition_snapshot_id",
      "expected_baseline_event_id",
    ]);
    requireTrue(
      q.schema_version === "operations-scope-obligation-drilldown-read.v1" &&
        q.root_kind ===
          (i === 1
            ? "large_project"
            : i === 2
            ? "packing_project"
            : "project") &&
        q.root_id === id((i + 1) * 100 + (i === 1 || i === 2 ? 19 : 17)) &&
        q.obligation_id === id((i + 1) * 100 + 18) &&
        uuid(q.expected_composition_snapshot_id) &&
        uuid(q.expected_baseline_event_id),
    );
  }
  const jwt = await token(secret, id(199));
  const before = counts(await control(controls, privateToken, "state"));
  const read = async (q: Request) => {
    const r = await rpc(
      base,
      jwt,
      "read_operations_scope_obligation_drilldown_v1",
      { p_request: q },
    );
    requireTrue(r.status === 200);
    return validateObligationDrilldown(r.data, {
      organizationId: id(1),
      rootKind: q.root_kind,
      rootId: q.root_id,
      obligationId: q.obligation_id,
      compositionSnapshotId: q.expected_composition_snapshot_id,
      baselineEventId: q.expected_baseline_event_id,
    });
  };
  const denied = async (
    who: string,
    q: unknown,
    status = 403,
    code = "42501",
  ) => {
    const r = await rpc(
      base,
      who,
      "read_operations_scope_obligation_drilldown_v1",
      { p_request: q },
    );
    requireTrue(r.status === status);
    requireTrue(
      typeof r.data === "object" && r.data !== null &&
        (r.data as { code?: unknown }).code === code,
    );
  };
  for (const label of ["project", "large", "packing"]) {
    phase = `drilldown ${label} root copied individual invoice`;
    const x = await read(requests[label]);
    requireTrue(
      x.state === "received_evidence" && x.sources.length === 1 &&
        x.sources[0].amountMinor === 180000 &&
        x.sources[0].status === "preliminary" &&
        x.baseline.estimateMinor === 1000000 &&
        x.baseline.committedMinor === null,
    );
    done();
  }
  phase = "drilldown unavailable categories and null prognosis";
  const x = await read(requests.project);
  requireTrue(
    Object.values(x.coverage).every((v) => v === "unavailable") &&
      Object.values(x.prognosis).every((v) => v === null) &&
      x.upstreamCurrentness === "unverified",
  );
  done();
  phase = "drilldown changed baseline preserves saved amount and null sources";
  const changed = await read(requests.baselineChanged);
  requireTrue(
    changed.state === "baseline_changed" &&
      changed.baseline.estimateMinor === 1000000 &&
      changed.sources.length === 0 &&
      changed.referenceCurrentness.baseline === false &&
      changed.prognosis.eacMinor === null,
  );
  done();
  phase = "drilldown superseded displayed composition returns PT409";
  await denied(jwt, requests.superseded, 409, "PT409");
  done();
  phase = "drilldown actual membership change returns PT409";
  await denied(jwt, requests.membershipChanged, 409, "PT409");
  done();
  phase = "drilldown unselected obligation returns PT409";
  await denied(
    jwt,
    { ...requests.project, obligation_id: id(999) },
    409,
    "PT409",
  );
  done();
  phase = "drilldown caller actor field is rejected";
  await denied(jwt, { ...requests.project, actor_id: id(199) }, 400, "22023");
  done();
  phase = "drilldown foreign live profile actor denied";
  await denied(await token(secret, id(93)), requests.project);
  done();
  phase = "drilldown actual project grant does not confer scope admin";
  const projectJwt = await token(secret, id(292));
  const granted = await rpc(
    base,
    projectJwt,
    "read_operations_catering_project_evidence_v3",
    { p_organization_id: id(1), p_project_id: id(117) },
  );
  requireTrue(
    granted.status === 200 &&
      (granted.data as { schema?: unknown }).schema ===
        "operations-catering-project-evidence.v3",
  );
  await denied(projectJwt, requests.project);
  done();
  phase = "drilldown signed missing actor denied";
  await denied(await token(secret, null), requests.project);
  done();
  phase = "drilldown HS256 signature genuinely checked";
  const pieces = jwt.split(".");
  pieces[2] = (pieces[2][0] === "A" ? "B" : "A") + pieces[2].slice(1);
  const invalid = await rpc(
    base,
    pieces.join("."),
    "read_operations_scope_obligation_drilldown_v1",
    { p_request: requests.project },
  );
  requireTrue(invalid.status === 401);
  done();
  phase = "drilldown live profile org change invalidates old tuple";
  await control(controls, privateToken, "move-admin-org");
  await denied(jwt, requests.project);
  await control(controls, privateToken, "restore-admin-org");
  requireTrue((await read(requests.project)).sources[0].amountMinor === 180000);
  done();
  phase = "drilldown live packing status policy revoke denied";
  await control(controls, privateToken, "revoke-packing-policy");
  await denied(jwt, requests.packing);
  done();
  phase = "drilldown deleted actual project root denied";
  await control(controls, privateToken, "delete-project-a");
  await denied(jwt, requests.project);
  done();
  phase = "drilldown revoked live administrator denied";
  await control(controls, privateToken, "revoke-admin");
  await denied(jwt, requests.large);
  done();
  phase = "drilldown reads and metadata controls preserve evidence ledgers";
  const after = counts(await control(controls, privateToken, "state"));
  requireTrue(countKeys.every((k) => before[k] === after[k]));
  done();
  console.log(
    JSON.stringify({
      result: "PASS",
      cases: passed,
      scope:
        "native signed fixture JWT/PostgREST one-obligation authorization; received evidence only",
    }),
  );
}
if (import.meta.main) {
  try {
    await main();
  } catch {
    console.error(
      JSON.stringify({
        case: phase,
        result: "FAIL",
        reason: "authenticated drilldown proof failed",
      }),
    );
    Deno.exit(1);
  }
}
