/**
 * Övergångskontrakt för Scanners befintliga osignerade personaltoken.
 *
 * Detta gör INTE tokenen kryptografiskt säker. Hjälparen finns för att flytta
 * credentialen från JSON-body till Authorization-headern och för att låsa den
 * till den aktiva mobilsession som lagras på staff_members. När alla klienter
 * använder Supabase Auth ska legacy-formatet tas bort helt.
 */

export type ScannerLegacyTokenClaims = {
  staffId: string;
  sessionId?: string;
  expiresAt: number;
};

export type ScannerLegacyTokenResult =
  | { valid: true; claims: ScannerLegacyTokenClaims }
  | { valid: false; error: string; reason: string };

export type ScannerTokenTransportResult =
  | { valid: true; token: string; source: "authorization" | "legacy_body" }
  | { valid: false; error: string; reason: string };

export function verifyScannerLegacyToken(
  token: string,
  nowMs = Date.now()
): ScannerLegacyTokenResult {
  try {
    if (!token || token.includes(".")) {
      return {
        valid: false,
        error: "Invalid token format",
        reason: "bad_format",
      };
    }
    const payload = JSON.parse(atob(token)) as Record<string, unknown>;
    if (
      typeof payload.staffId !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return {
        valid: false,
        error: "Invalid token format",
        reason: "bad_format",
      };
    }
    if (nowMs > payload.expiresAt) {
      return { valid: false, error: "Token expired", reason: "expired" };
    }
    return {
      valid: true,
      claims: {
        staffId: payload.staffId,
        expiresAt: payload.expiresAt,
        ...(typeof payload.sessionId === "string"
          ? { sessionId: payload.sessionId }
          : {}),
      },
    };
  } catch {
    return { valid: false, error: "Invalid token", reason: "parse_error" };
  }
}

export function resolveScannerTokenTransport(
  authorizationHeader: string | null,
  legacyBodyToken: unknown
): ScannerTokenTransportResult {
  const bodyToken =
    typeof legacyBodyToken === "string" && legacyBodyToken.length > 0
      ? legacyBodyToken
      : null;

  if (authorizationHeader != null) {
    if (!authorizationHeader.startsWith("Bearer ")) {
      return {
        valid: false,
        error: "Malformed Authorization header",
        reason: "bad_authorization_header",
      };
    }
    const headerToken = authorizationHeader.slice("Bearer ".length).trim();
    if (!headerToken) {
      return {
        valid: false,
        error: "Missing bearer token",
        reason: "missing_token",
      };
    }
    if (bodyToken != null && bodyToken !== headerToken) {
      return {
        valid: false,
        error: "Conflicting authentication credentials",
        reason: "token_transport_mismatch",
      };
    }
    return { valid: true, token: headerToken, source: "authorization" };
  }

  if (bodyToken != null) {
    return { valid: true, token: bodyToken, source: "legacy_body" };
  }

  return { valid: false, error: "Token required", reason: "missing_token" };
}

export function activeScannerSessionMatches(
  activeSessionId: string | null | undefined,
  tokenSessionId: string | undefined
): boolean {
  return !activeSessionId || tokenSessionId === activeSessionId;
}
