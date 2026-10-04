import { readBoundedBody } from "../_shared/project-personnel-ingestion-transport.ts";
import {
  STEP8_BACKEND_ENVELOPE_MAX_BYTES,
  STEP8_REQUEST_MAX_BYTES,
  STEP8_SERVICE_READ_ROUTE,
  canonicalJson,
  step8ResponseWireHeaders,
  type Step8RequestHeaders,
  type Step8ServiceReadRequest,
  validateStep8RequestBody,
  validateStep8RequestHeaders,
  validateStep8ResponseBody,
  validateStep8ResponseHeaders,
} from "../_shared/project-economy-step8-service-read-contract.ts";

const BACKEND_TIMEOUT_MS = 5_000;
const REQUEST_BODY_TIMEOUT_MS = 5_000;

export interface Step8ServiceReadDependencies {
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  nowSeconds?(): number;
}

const errorResponse = (status: number, error: string) =>
  new Response(canonicalJson({ error }), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
    },
  });

function trustedSupabaseUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash || !["", "/"].includes(url.pathname)
  ) throw new Error("backend_not_configured");
  return url.origin;
}

function decodeJwtRole(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - parts[1].length % 4) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

interface PublicSupabaseAuthority {
  apikey: string;
  authorization: string | null;
}

function publicSupabaseKey(raw: string): PublicSupabaseAuthority {
  if (
    !raw || raw.length > 8_192 || raw.startsWith("sb_secret_") ||
    raw.startsWith("sb_service_role_")
  ) throw new Error("backend_not_configured");
  if (raw.startsWith("sb_publishable_")) {
    return { apikey: raw, authorization: null };
  }
  if (decodeJwtRole(raw) !== "anon") throw new Error("backend_not_configured");
  return { apikey: raw, authorization: `Bearer ${raw}` };
}

function exactRoute(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === STEP8_SERVICE_READ_ROUTE && !url.search && !url.hash &&
    !url.username && !url.password;
}

function exactContentType(request: Request): boolean {
  return request.headers.get("content-type") === "application/json";
}

function backendStatus(status: number): Response {
  if (status === 401 || status === 403) {
    return errorResponse(403, "forbidden");
  }
  if (status === 409) return errorResponse(409, "request_conflict");
  return errorResponse(503, "backend_unavailable");
}

export async function handleProjectEconomyStep8ServiceRead(
  request: Request,
  dependencies: Step8ServiceReadDependencies,
): Promise<Response> {
  if (!exactRoute(request)) return errorResponse(404, "route_not_found");
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed");
  }
  if (
    dependencies.env(
      "OPERATIONS_PROJECT_ECONOMY_STEP8_SERVICE_READ_ENABLED",
    ) !== "true"
  ) return errorResponse(503, "service_read_disabled");
  if (!exactContentType(request)) {
    return errorResponse(415, "unsupported_media_type");
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(declaredLength) ||
      Number(declaredLength) > STEP8_REQUEST_MAX_BYTES)
  ) return errorResponse(413, "invalid_request_body");

  let rawBody: string;
  try {
    const bytes = await readBoundedBody(
      request.body,
      STEP8_REQUEST_MAX_BYTES,
      REQUEST_BODY_TIMEOUT_MS,
    );
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return errorResponse(
      error instanceof Error && error.message === "body_too_large"
        ? 413
        : error instanceof Error && error.message === "body_read_timeout"
        ? 408
        : 400,
      "invalid_request_body",
    );
  }

  const nowSeconds = (dependencies.nowSeconds ??
    (() => Math.floor(Date.now() / 1_000)))();
  let requestBody: Step8ServiceReadRequest;
  let requestHeaders: Step8RequestHeaders;
  try {
    requestBody = validateStep8RequestBody(rawBody);
    requestHeaders = await validateStep8RequestHeaders(
      request.headers,
      requestBody,
      rawBody,
      nowSeconds,
    );
  } catch {
    return errorResponse(400, "invalid_request");
  }

  let backendUrl: string;
  let anonAuthority: PublicSupabaseAuthority;
  try {
    backendUrl = trustedSupabaseUrl(dependencies.env("SUPABASE_URL") ?? "");
    // Deliberately do not read SUPABASE_SERVICE_ROLE_KEY. This endpoint's only
    // database authority is the public/anon cryptographic admission RPC.
    anonAuthority = publicSupabaseKey(
      dependencies.env("SUPABASE_ANON_KEY") ?? "",
    );
  } catch {
    return errorResponse(503, "backend_not_configured");
  }

  let backend: Response;
  try {
    backend = await (dependencies.fetch ?? fetch)(
      `${backendUrl}/rest/v1/rpc/read_project_economy_step8_service_v1`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
        headers: {
          apikey: anonAuthority.apikey,
          ...(anonAuthority.authorization
            ? { authorization: anonAuthority.authorization }
            : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_raw_body: rawBody,
          p_headers: requestHeaders,
        }),
      },
    );
  } catch {
    return errorResponse(503, "backend_unavailable");
  }
  if (!backend.ok) {
    void backend.body?.cancel().catch(() => {});
    return backendStatus(backend.status);
  }

  let envelope: unknown;
  try {
    const bytes = await readBoundedBody(
      backend.body,
      STEP8_BACKEND_ENVELOPE_MAX_BYTES,
      BACKEND_TIMEOUT_MS,
    );
    envelope = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return errorResponse(503, "invalid_backend_response");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return errorResponse(503, "invalid_backend_response");
  }
  const value = envelope as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    !["status", "rawBody", "responseHeaders"].every((key) =>
      Object.hasOwn(value, key)
    ) ||
    typeof value.status !== "number" ||
    !Number.isSafeInteger(value.status) ||
    ![200, 409].includes(value.status) ||
    typeof value.rawBody !== "string"
  ) return errorResponse(503, "invalid_backend_response");

  try {
    const responseHeaders = validateStep8ResponseHeaders(
      value.responseHeaders,
      requestHeaders,
      nowSeconds,
    );
    const responseBody = await validateStep8ResponseBody(
      value.rawBody,
      responseHeaders,
      requestBody,
      requestHeaders,
    );
    const expectedStatus = responseBody.outcome === "available" ? 200 : 409;
    if (value.status !== expectedStatus) throw new Error("status_mismatch");
    return new Response(value.rawBody, {
      status: expectedStatus,
      headers: step8ResponseWireHeaders(responseHeaders),
    });
  } catch {
    return errorResponse(503, "invalid_backend_response");
  }
}
