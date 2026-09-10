/**
 * CORS-gräns för den fristående, signerade EventFlow Scanner-klienten.
 *
 * Planning-mobilens legacyflöde behåller sin befintliga wildcard-CORS under
 * övergången. Scanner v2 måste däremot skicka ett versionshuvud och tillåts
 * endast från explicita origins i SCANNER_ALLOWED_ORIGINS. Server-till-server
 * saknar Origin och är tillåtet utan att något CORS-huvud returneras.
 */

export const SCANNER_CONTRACT_HEADER = "x-eventflow-scanner-contract";
export const SCANNER_CONTRACT_VERSION = "scanner_contract_v1";
export const SCANNER_RELEASE_HEADER = "x-eventflow-scanner-release";

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-eventflow-scanner-contract",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Echoes the negotiated Scanner contract on every versioned response. The
 * client uses this as a fail-closed deployment compatibility proof; an older
 * function deployment cannot silently be mistaken for contract v1.
 */
export function scannerContractResponseHeaders(
  headers: Record<string, string>,
  releaseSha?: string,
): Record<string, string> {
  return {
    ...headers,
    "Access-Control-Expose-Headers": releaseSha
      ? `${SCANNER_CONTRACT_HEADER}, ${SCANNER_RELEASE_HEADER}`
      : SCANNER_CONTRACT_HEADER,
    [SCANNER_CONTRACT_HEADER]: SCANNER_CONTRACT_VERSION,
    ...(releaseSha ? { [SCANNER_RELEASE_HEADER]: releaseSha } : {}),
  };
}

export type ScannerCorsDecision = {
  allowed: boolean;
  headers: Record<string, string>;
};

function canonicalWebOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin === value ? value : null;
  } catch {
    return null;
  }
}

export function parseScannerAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const candidate of raw?.split(",") ?? []) {
    const value = candidate.trim();
    if (!value || value === "*") continue;
    const canonical = canonicalWebOrigin(value);
    if (canonical) origins.add(canonical);
  }
  return origins;
}

export function requestsScannerContract(request: Request): boolean {
  return request.headers.get(SCANNER_CONTRACT_HEADER) === SCANNER_CONTRACT_VERSION;
}

export function preflightsScannerContract(request: Request): boolean {
  const requested = request.headers.get("access-control-request-headers") ?? "";
  return requested
    .split(",")
    .some((header) => header.trim().toLowerCase() === SCANNER_CONTRACT_HEADER);
}

export function scannerCorsHeaders(
  requestOrigin: string | null,
  configuredOrigins: string | undefined,
  legacyWildcard: boolean,
): ScannerCorsDecision {
  if (legacyWildcard) {
    return {
      allowed: true,
      headers: { ...BASE_HEADERS, "Access-Control-Allow-Origin": "*" },
    };
  }

  if (requestOrigin == null) {
    return { allowed: true, headers: { ...BASE_HEADERS } };
  }

  const allowedOrigins = parseScannerAllowedOrigins(configuredOrigins);
  if (!allowedOrigins.has(requestOrigin)) {
    return { allowed: false, headers: { ...BASE_HEADERS, Vary: "Origin" } };
  }

  return {
    allowed: true,
    headers: {
      ...BASE_HEADERS,
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    },
  };
}
