import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  activeScannerSessionMatches,
  resolveScannerTokenTransport,
  verifyScannerLegacyToken,
} from "../../supabase/functions/_shared/scannerLegacyAuth";

function token(payload: Record<string, unknown>): string {
  return btoa(JSON.stringify(payload));
}

describe("Scanner legacy-auth transition", () => {
  it("prioriterar Authorization och tillåter identisk body-token under utrullning", () => {
    expect(resolveScannerTokenTransport("Bearer abc", undefined)).toEqual({
      valid: true,
      token: "abc",
      source: "authorization",
    });
    expect(resolveScannerTokenTransport("Bearer abc", "abc")).toEqual({
      valid: true,
      token: "abc",
      source: "authorization",
    });
  });

  it("avvisar motstridiga credentials och felaktig Authorization-header", () => {
    expect(resolveScannerTokenTransport("Bearer header", "body")).toMatchObject(
      {
        valid: false,
        reason: "token_transport_mismatch",
      }
    );
    expect(resolveScannerTokenTransport("Basic abc", undefined)).toMatchObject({
      valid: false,
      reason: "bad_authorization_header",
    });
  });

  it("tillåter body-token endast som uttrycklig legacy-övergång", () => {
    expect(resolveScannerTokenTransport(null, "legacy")).toEqual({
      valid: true,
      token: "legacy",
      source: "legacy_body",
    });
    expect(resolveScannerTokenTransport(null, undefined)).toMatchObject({
      valid: false,
      reason: "missing_token",
    });
  });

  it("läser staff-, session- och expiry-claims men accepterar inte JWT som legacy-token", () => {
    const encoded = token({
      staffId: "staff-1",
      sessionId: "session-1",
      expiresAt: 2_000,
    });
    expect(verifyScannerLegacyToken(encoded, 1_000)).toEqual({
      valid: true,
      claims: { staffId: "staff-1", sessionId: "session-1", expiresAt: 2_000 },
    });
    expect(verifyScannerLegacyToken("a.b.c", 1_000)).toMatchObject({
      valid: false,
      reason: "bad_format",
    });
  });

  it("avvisar utgången eller manipulerad token fail closed", () => {
    expect(
      verifyScannerLegacyToken(
        token({ staffId: "staff-1", expiresAt: 999 }),
        1_000
      )
    ).toMatchObject({ valid: false, reason: "expired" });
    expect(verifyScannerLegacyToken("inte-base64", 1_000)).toMatchObject({
      valid: false,
      reason: "parse_error",
    });
  });

  it("binder token till aktiv mobilsession när en sådan finns", () => {
    expect(activeScannerSessionMatches(null, undefined)).toBe(true);
    expect(activeScannerSessionMatches("session-1", "session-1")).toBe(true);
    expect(activeScannerSessionMatches("session-1", undefined)).toBe(false);
    expect(activeScannerSessionMatches("session-1", "session-2")).toBe(false);
  });

  it("är inkopplad i scanner-api utan kvarvarande inline-parser", () => {
    const source = readFileSync(
      "supabase/functions/scanner-api/index.ts",
      "utf8"
    );

    expect(source).toMatch(/from ['"]\.\.\/_shared\/scannerLegacyAuth\.ts['"]/);
    expect(source).toContain("req.headers.get('Authorization')");
    expect(source).toContain("token: legacyBodyToken");
    expect(source).toContain("active_mobile_session_id");
    expect(source).toContain("activeScannerSessionMatches(");
    expect(source).not.toContain("JSON.parse(atob(token))");
  });
});
