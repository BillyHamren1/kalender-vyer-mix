/**
 * Signerad, versionsstyrd credential för den fristående EventFlow Scanner.
 *
 * Detta är INTE en Supabase Auth-session och får inte användas som en sådan.
 * Den är en kortlivad HMAC-credential för övergången från Plannings osignerade
 * mobiltoken. En separat SCANNER_TOKEN_SIGNING_SECRET krävs; service_role får
 * aldrig återanvändas som signeringsnyckel.
 */

export const SCANNER_SIGNED_TOKEN_PREFIX = "efs2";
export const SCANNER_SIGNED_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type ScannerSignedClaims = {
  version: 2;
  audience: "eventflow-scanner";
  staffId: string;
  organizationId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export type ScannerSignedTokenResult =
  | { valid: true; claims: ScannerSignedClaims }
  | { valid: false; error: string; reason: string };

function validOpaqueId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function assertSigningSecret(secret: string): void {
  if (new TextEncoder().encode(secret).length < 32) {
    throw new Error(
      "SCANNER_TOKEN_SIGNING_SECRET must contain at least 32 bytes"
    );
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url");
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importHmacKey(
  secret: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  assertSigningSecret(secret);
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

export async function createScannerSignedToken(
  input: Pick<ScannerSignedClaims, "staffId" | "organizationId" | "sessionId">,
  secret: string,
  nowMs = Date.now(),
  ttlMs = SCANNER_SIGNED_TOKEN_TTL_MS
): Promise<string> {
  if (
    !validOpaqueId(input.staffId) ||
    !validOpaqueId(input.organizationId) ||
    !validOpaqueId(input.sessionId)
  ) {
    throw new Error("Scanner token claims require canonical owner-system IDs");
  }
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > MAX_TOKEN_TTL_MS
  ) {
    throw new Error("Scanner token lifetime is invalid");
  }

  const claims: ScannerSignedClaims = {
    version: 2,
    audience: "eventflow-scanner",
    staffId: input.staffId,
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    issuedAt: nowMs,
    expiresAt: nowMs + ttlMs,
  };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${SCANNER_SIGNED_TOKEN_PREFIX}.${payload}`;
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyScannerSignedToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): Promise<ScannerSignedTokenResult> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== SCANNER_SIGNED_TOKEN_PREFIX) {
      return {
        valid: false,
        error: "Invalid signed token format",
        reason: "bad_format",
      };
    }
    const payloadPart = parts[1]!;
    const signature = fromBase64Url(parts[2]!);
    const key = await importHmacKey(secret, ["verify"]);
    const authentic = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${SCANNER_SIGNED_TOKEN_PREFIX}.${payloadPart}`)
    );
    if (!authentic) {
      return {
        valid: false,
        error: "Invalid signed token",
        reason: "bad_signature",
      };
    }

    const claims = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadPart))
    ) as Record<string, unknown>;
    if (
      claims.version !== 2 ||
      claims.audience !== "eventflow-scanner" ||
      !validOpaqueId(claims.staffId) ||
      !validOpaqueId(claims.organizationId) ||
      !validOpaqueId(claims.sessionId) ||
      typeof claims.issuedAt !== "number" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > MAX_TOKEN_TTL_MS ||
      claims.issuedAt > nowMs + MAX_CLOCK_SKEW_MS
    ) {
      return {
        valid: false,
        error: "Invalid signed token claims",
        reason: "bad_claims",
      };
    }
    if (nowMs >= claims.expiresAt) {
      return { valid: false, error: "Signed token expired", reason: "expired" };
    }

    return { valid: true, claims: claims as ScannerSignedClaims };
  } catch {
    return {
      valid: false,
      error: "Invalid signed token",
      reason: "parse_error",
    };
  }
}
