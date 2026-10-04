import {
  STEP8_BACKEND_ENVELOPE_MAX_BYTES,
  STEP8_REQUEST_AUDIENCE,
  STEP8_REQUEST_ISSUER,
  STEP8_REQUEST_SCHEMA,
  STEP8_RESPONSE_AUDIENCE,
  STEP8_RESPONSE_ISSUER,
  STEP8_RESPONSE_SCHEMA,
  STEP8_SERVICE_READ_PROTOCOL,
  STEP8_SERVICE_READ_ROUTE,
  buildStep8RequestSigningFrame,
  buildStep8ResponseSigningFrame,
  canonicalJson,
  sha256Hex,
  type Step8RequestHeaders,
  type Step8ServiceReadRequest,
  type Step8ResponseHeaders,
} from "../_shared/project-economy-step8-service-read-contract.ts";
import { handleProjectEconomyStep8ServiceRead as handle } from "./handler.ts";

const NOW = 1_790_899_200;
const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const ANON_KEY = `${base64url({ alg: "HS256", typ: "JWT" })}.${
  base64url({ role: "anon" })
}.fixture-signature`;

function requestBody(): Step8ServiceReadRequest {
  return {
    actorSubjectHash: "a".repeat(64),
    audience: STEP8_REQUEST_AUDIENCE,
    authCheckedAt: NOW - 1,
    destinationOrganizationId: id(1),
    destinationProjectId: id(2),
    expiresAt: NOW + 60,
    issuedAt: NOW,
    issuer: STEP8_REQUEST_ISSUER,
    mappingBasis: "finance_local_current_component_map",
    nonce: "n".repeat(43),
    operation: "read",
    requestId: id(3),
    schemaVersion: STEP8_REQUEST_SCHEMA,
    shadowOnly: true,
    sourceCount: 2,
    sourceOrganizationId: id(4),
    sourceProjectId: id(5),
    sourceSetFingerprint: "f".repeat(64),
  };
}

async function headersFor(
  rawBody: string,
  body = requestBody(),
  changes: Record<string, string> = {},
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    "x-eventflow-protocol": STEP8_SERVICE_READ_PROTOCOL,
    "x-eventflow-issuer": STEP8_REQUEST_ISSUER,
    "x-eventflow-audience": STEP8_REQUEST_AUDIENCE,
    "x-eventflow-key-id": "finance_step8_fixture",
    "x-eventflow-key-version": "1",
    "x-eventflow-request-id": body.requestId,
    "x-eventflow-nonce": body.nonce,
    "x-eventflow-issued-at": String(body.issuedAt),
    "x-eventflow-expires-at": String(body.expiresAt),
    "x-eventflow-body-sha256": await sha256Hex(rawBody),
    "x-eventflow-actor-subject-hash": body.actorSubjectHash,
    "x-eventflow-auth-checked-at": String(body.authCheckedAt),
    "x-eventflow-signature": `hmac-sha256=${"1".repeat(64)}`,
    ...changes,
  };
}

async function serviceRequest(
  rawBody = canonicalJson(requestBody()),
  options: {
    path?: string;
    method?: string;
    body?: Step8ServiceReadRequest;
    headers?: Record<string, string>;
  } = {},
): Promise<Request> {
  const body = options.body ?? requestBody();
  return new Request(
    `https://operations.example${options.path ?? STEP8_SERVICE_READ_ROUTE}`,
    {
      method: options.method ?? "POST",
      headers: await headersFor(rawBody, body, options.headers),
      body: options.method === "GET" ? undefined : rawBody,
    },
  );
}

const baseEnv: Record<string, string> = {
  OPERATIONS_PROJECT_ECONOMY_STEP8_SERVICE_READ_ENABLED: "true",
  SUPABASE_URL: "https://isolated-project.supabase.co",
  SUPABASE_ANON_KEY: ANON_KEY,
};

function deps(fetchImpl?: typeof fetch) {
  return {
    env: (name: string) => baseEnv[name],
    fetch: fetchImpl,
    nowSeconds: () => NOW,
  };
}

async function signedBackendEnvelope(
  body: Step8ServiceReadRequest,
  requestHeaders: Step8RequestHeaders,
  outcome: "available" | "unavailable" = "available",
) {
  const payload = outcome === "available"
    ? {
      authoritativeTotals: false,
      financeRecalculated: false,
      organizationId: body.sourceOrganizationId,
      projectId: body.sourceProjectId,
      schemaVersion: "operations-project-economy-step8-shadow.v1",
      shadowOnly: true,
    }
    : null;
  const responseBody = {
    audience: STEP8_RESPONSE_AUDIENCE,
    destinationOrganizationId: body.destinationOrganizationId,
    destinationProjectId: body.destinationProjectId,
    expiresAt: NOW + 60,
    issuedAt: NOW,
    issuer: STEP8_RESPONSE_ISSUER,
    nonce: requestHeaders.nonce,
    outcome,
    payload,
    payloadSha256: payload === null
      ? null
      : await sha256Hex(canonicalJson(payload)),
    requestBodySha256: requestHeaders.bodySha256,
    requestId: body.requestId,
    requestNonceSha256: await sha256Hex(body.nonce),
    schemaVersion: STEP8_RESPONSE_SCHEMA,
    shadowOnly: true,
    sourceOrganizationId: body.sourceOrganizationId,
    sourceProjectId: body.sourceProjectId,
    sourceSetFingerprint: body.sourceSetFingerprint,
  };
  const rawBody = canonicalJson(responseBody);
  const responseHeaders: Step8ResponseHeaders = {
    audience: STEP8_RESPONSE_AUDIENCE,
    bodySha256: await sha256Hex(rawBody),
    expiresAt: NOW + 60,
    issuedAt: NOW,
    issuer: STEP8_RESPONSE_ISSUER,
    nonce: responseBody.nonce,
    protocol: STEP8_SERVICE_READ_PROTOCOL,
    requestBodySha256: requestHeaders.bodySha256,
    requestId: body.requestId,
    requestNonceSha256: responseBody.requestNonceSha256,
    responseKeyId: "operations_step8_fixture",
    responseKeyVersion: 1,
    signature: "2".repeat(64),
  };
  return {
    status: outcome === "available" ? 200 : 409,
    rawBody,
    responseHeaders,
  };
}

Deno.test("step8 service read stays default-off and binds exact POST route", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls++;
    throw new Error("unexpected_backend_call");
  };
  const request = await serviceRequest();
  assert(
    (await handle(request, { env: () => undefined, fetch: fetchImpl })).status ===
      503,
  );
  assert(
    (await handle(
      await serviceRequest(undefined, { method: "GET" }),
      deps(fetchImpl),
    )).status === 405,
  );
  for (
    const path of [
      "/project-economy-step8-service-read",
      `${STEP8_SERVICE_READ_ROUTE}/extra`,
      `${STEP8_SERVICE_READ_ROUTE}?scope=other`,
    ]
  ) {
    assert(
      (await handle(
        await serviceRequest(undefined, { path }),
        deps(fetchImpl),
      )).status === 404,
    );
  }
  assert(calls === 0);
});

Deno.test("step8 canonical request rejects extra, missing, whitespace, duplicate and changed raw bytes", async () => {
  const body = requestBody();
  const canonical = canonicalJson(body);
  const variants = [
    canonicalJson({ ...body, privateCustomer: "must-not-cross" }),
    canonicalJson(
      Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== "sourceProjectId"),
      ),
    ),
    `${canonical} `,
    canonical.replace(
      "{",
      `{"actorSubjectHash":"${body.actorSubjectHash}",`,
    ),
  ];
  for (const raw of variants) {
    let calls = 0;
    const response = await handle(await serviceRequest(raw, { body }), {
      ...deps(),
      fetch: () => {
        calls++;
        throw new Error("unexpected_backend_call");
      },
    });
    assert(response.status === 400);
    assert(calls === 0);
  }
  const changed = canonical.replace(body.sourceProjectId, id(99));
  const response = await handle(
    await serviceRequest(changed, {
      body,
      headers: { "x-eventflow-body-sha256": await sha256Hex(canonical) },
    }),
    deps(),
  );
  assert(response.status === 400);
});

Deno.test("step8 request rejects media type, over-limit body and malformed proofs", async () => {
  assert(
    (await handle(
      await serviceRequest(undefined, {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      deps(),
    )).status === 415,
  );
  const oversized = `{"padding":"${"x".repeat(4_096)}"}`;
  assert(
    (await handle(await serviceRequest(oversized), deps())).status === 413,
  );
  for (
    const headers of [
      { "x-eventflow-key-version": "01" },
      { "x-eventflow-issued-at": String(NOW + 6) },
      { "x-eventflow-expires-at": String(NOW + 61) },
      { "x-eventflow-nonce": "short" },
      { "x-eventflow-signature": "v1=" + "1".repeat(64) },
      { "x-eventflow-request-id": id(90) },
      { "x-eventflow-body-sha256": "A".repeat(64) },
    ]
  ) {
    assert(
      (await handle(
        await serviceRequest(undefined, { headers }),
        deps(),
      )).status === 400,
    );
  }
  for (
    const body of [
      { ...requestBody(), expiresAt: NOW + 61 },
      { ...requestBody(), authCheckedAt: NOW - 61 },
      { ...requestBody(), issuedAt: NOW + 6, expiresAt: NOW + 60 },
    ]
  ) {
    const rawBody = canonicalJson(body);
    assert(
      (await handle(
        await serviceRequest(rawBody, {
          body: body as Step8ServiceReadRequest,
        }),
        deps(),
      )).status === 400,
    );
  }
});

Deno.test("step8 rejects service-role-shaped database authority before backend", async () => {
  for (const key of [
    "sb_secret_must_never_be_used",
    `${base64url({ alg: "HS256" })}.${base64url({ role: "service_role" })}.fixture`,
  ]) {
    let calls = 0;
    const response = await handle(await serviceRequest(), {
      ...deps(),
      env: (name) =>
        name === "SUPABASE_ANON_KEY" ? key : baseEnv[name],
      fetch: () => {
        calls++;
        throw new Error("unexpected_backend_call");
      },
    });
    assert(response.status === 503);
    assert(calls === 0);
  }
});

Deno.test("step8 backend uses only anon authority and forwards exact raw body plus headers", async () => {
  const body = requestBody(), rawBody = canonicalJson(body);
  const envReads: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    assert(
      String(input) ===
        "https://isolated-project.supabase.co/rest/v1/rpc/read_project_economy_step8_service_v1",
    );
    assert(init?.method === "POST" && init.redirect === "error");
    assert(init.signal instanceof AbortSignal);
    const headers = new Headers(init.headers);
    assert(headers.get("apikey") === ANON_KEY);
    assert(headers.get("authorization") === `Bearer ${ANON_KEY}`);
    const args = JSON.parse(String(init.body));
    assert(args.p_raw_body === rawBody);
    assert(Object.keys(args).length === 2);
    assert(args.p_headers.method === "POST");
    assert(args.p_headers.route === STEP8_SERVICE_READ_ROUTE);
    assert(args.p_headers.actorSubjectHash === body.actorSubjectHash);
    return Response.json(
      await signedBackendEnvelope(body, args.p_headers as Step8RequestHeaders),
    );
  };
  const response = await handle(await serviceRequest(rawBody, { body }), {
    env: (name) => {
      envReads.push(name);
      if (name.includes("SERVICE_ROLE")) {
        throw new Error("service_role_must_not_be_read");
      }
      return baseEnv[name];
    },
    fetch: fetchImpl,
    nowSeconds: () => NOW,
  });
  assert(response.status === 200);
  assert(!envReads.some((name) => name.includes("SERVICE_ROLE")));
  const output = await response.text();
  assert(output === (await signedBackendEnvelope(
    body,
    JSON.parse(JSON.stringify({
      method: "POST",
      route: STEP8_SERVICE_READ_ROUTE,
      protocol: STEP8_SERVICE_READ_PROTOCOL,
      issuer: STEP8_REQUEST_ISSUER,
      audience: STEP8_REQUEST_AUDIENCE,
      requestKeyId: "finance_step8_fixture",
      requestKeyVersion: 1,
      requestId: body.requestId,
      nonce: body.nonce,
      issuedAt: NOW,
      expiresAt: NOW + 60,
      bodySha256: await sha256Hex(rawBody),
      actorSubjectHash: body.actorSubjectHash,
      authCheckedAt: NOW - 1,
      signature: `hmac-sha256=${"1".repeat(64)}`,
    })) as Step8RequestHeaders,
  )).rawBody);
  assert(response.headers.get("cache-control") === "no-store");
  assert(response.headers.get("x-eventflow-signature") ===
    `hmac-sha256=${"2".repeat(64)}`);
  assert(response.headers.get("x-eventflow-request-id") === body.requestId);
});

Deno.test("step8 publishable database authority is apikey-only and never Bearer", async () => {
  const publishable = "sb_publishable_isolated_step8_fixture";
  const body = requestBody();
  let calls = 0;
  const response = await handle(await serviceRequest(), {
    env: (name) =>
      name === "SUPABASE_ANON_KEY" ? publishable : baseEnv[name],
    nowSeconds: () => NOW,
    fetch: async (_input, init) => {
      calls++;
      const headers = new Headers(init?.headers);
      assert(headers.get("apikey") === publishable);
      assert(headers.get("authorization") === null);
      const args = JSON.parse(String(init?.body));
      return Response.json(
        await signedBackendEnvelope(
          body,
          args.p_headers as Step8RequestHeaders,
        ),
      );
    },
  });
  assert(response.status === 200);
  assert(calls === 1);
});

Deno.test("step8 passes through an exact signed unavailable response as 409", async () => {
  const body = requestBody();
  const response = await handle(await serviceRequest(), deps(async (_input, init) => {
    const args = JSON.parse(String(init?.body));
    return Response.json(
      await signedBackendEnvelope(
        body,
        args.p_headers as Step8RequestHeaders,
        "unavailable",
      ),
    );
  }));
  assert(response.status === 409);
  assert((await response.json()).outcome === "unavailable");
  assert(response.headers.get("x-eventflow-signature") ===
    `hmac-sha256=${"2".repeat(64)}`);
});

Deno.test("step8 backend HTTP failures, timeout and malformed bodies stay redacted", async () => {
  for (const [backendCode, expected] of [[401, 403], [403, 403], [409, 409], [500, 503]] as const) {
    const response = await handle(await serviceRequest(), deps(() =>
      Promise.resolve(
        new Response("sensitive backend detail", { status: backendCode }),
      )));
    assert(response.status === expected);
    assert(!(await response.text()).includes("sensitive"));
  }
  const timeout = await handle(await serviceRequest(), deps(() =>
    Promise.reject(new DOMException("timed out", "AbortError"))));
  assert(timeout.status === 503);
  const nonJson = await handle(
    await serviceRequest(),
    deps(() => Promise.resolve(new Response("not-json", { status: 200 }))),
  );
  assert(nonJson.status === 503);
  const oversized = await handle(
    await serviceRequest(),
    deps(() =>
      Promise.resolve(
        new Response("x".repeat(STEP8_BACKEND_ENVELOPE_MAX_BYTES + 1)),
      )),
  );
  assert(oversized.status === 503);
});

Deno.test("step8 rejects unsigned, mismatched, shifted and oversized successful backend envelopes", async () => {
  const body = requestBody();
  for (const mutation of [
    "signature",
    "source",
    "extra",
    "oversized",
    "payload_oversized",
    "shifted_nonce",
    "shifted_ttl",
  ] as const) {
    const response = await handle(await serviceRequest(), deps(async (_input, init) => {
      const args = JSON.parse(String(init?.body));
      const envelope = await signedBackendEnvelope(
        body,
        args.p_headers as Step8RequestHeaders,
      );
      if (mutation === "signature") envelope.responseHeaders.signature = "bad";
      if (mutation === "source") {
        const parsed = JSON.parse(envelope.rawBody);
        parsed.sourceProjectId = id(99);
        envelope.rawBody = canonicalJson(parsed);
        envelope.responseHeaders.bodySha256 = await sha256Hex(envelope.rawBody);
      }
      if (mutation === "extra") {
        (envelope as unknown as Record<string, unknown>).extra = true;
      }
      if (mutation === "oversized") envelope.rawBody = "x".repeat(300 * 1024 + 1);
      if (mutation === "payload_oversized") {
        const parsed = JSON.parse(envelope.rawBody);
        parsed.payload = { padding: "x".repeat(256 * 1024) };
        parsed.payloadSha256 = await sha256Hex(canonicalJson(parsed.payload));
        envelope.rawBody = canonicalJson(parsed);
        envelope.responseHeaders.bodySha256 = await sha256Hex(envelope.rawBody);
      }
      if (mutation === "shifted_nonce") {
        const parsed = JSON.parse(envelope.rawBody);
        parsed.nonce = "s".repeat(43);
        envelope.responseHeaders.nonce = parsed.nonce;
        envelope.rawBody = canonicalJson(parsed);
        envelope.responseHeaders.bodySha256 = await sha256Hex(envelope.rawBody);
      }
      if (mutation === "shifted_ttl") {
        const parsed = JSON.parse(envelope.rawBody);
        parsed.issuedAt++;
        parsed.expiresAt++;
        envelope.responseHeaders.issuedAt = parsed.issuedAt;
        envelope.responseHeaders.expiresAt = parsed.expiresAt;
        envelope.rawBody = canonicalJson(parsed);
        envelope.responseHeaders.bodySha256 = await sha256Hex(envelope.rawBody);
      }
      return Response.json(envelope);
    }));
    assert(response.status === 503);
  }
});

Deno.test("step8 signing frames are deterministic and purpose separated", async () => {
  const body = requestBody(), rawBody = canonicalJson(body);
  const headers = await headersFor(rawBody, body);
  const requestHeaders: Step8RequestHeaders = {
    method: "POST",
    route: STEP8_SERVICE_READ_ROUTE,
    protocol: STEP8_SERVICE_READ_PROTOCOL,
    issuer: STEP8_REQUEST_ISSUER,
    audience: STEP8_REQUEST_AUDIENCE,
    requestKeyId: headers["x-eventflow-key-id"],
    requestKeyVersion: 1,
    requestId: body.requestId,
    nonce: body.nonce,
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
    bodySha256: headers["x-eventflow-body-sha256"],
    actorSubjectHash: body.actorSubjectHash,
    authCheckedAt: body.authCheckedAt,
    signature: headers["x-eventflow-signature"],
  };
  const envelope = await signedBackendEnvelope(body, requestHeaders);
  const requestFrame = buildStep8RequestSigningFrame(requestHeaders);
  const responseFrame = buildStep8ResponseSigningFrame(
    envelope.responseHeaders,
  );
  assert(requestFrame === buildStep8RequestSigningFrame(requestHeaders));
  assert(responseFrame === buildStep8ResponseSigningFrame(envelope.responseHeaders));
  assert(requestFrame !== responseFrame);
  assert(!requestFrame.includes("secret") && !responseFrame.includes("secret"));
});
