import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MIN_SCANNER_SIGNING_SECRET_BYTES,
  SCANNER_SIGNED_TOKEN_TTL_MS,
  createScannerSignedToken,
  scannerReleaseMatches,
  scannerSigningSecretReady,
  verifyScannerSignedToken,
} from "../../supabase/functions/_shared/scannerSignedAuth";

const SECRET = "scanner-test-secret-with-at-least-32-bytes";
const CLAIMS = {
  staffId: "staff-1",
  organizationId: "org-1",
  sessionId: "session-1",
  releaseSha: "a".repeat(40),
};

describe("Scanner signed credential v2", () => {
  it("signerar och verifierar kanoniska ägarsystemsclaims", async () => {
    const token = await createScannerSignedToken(CLAIMS, SECRET, 1_000);
    expect(token.startsWith("efs2.")).toBe(true);
    await expect(
      verifyScannerSignedToken(token, SECRET, 2_000)
    ).resolves.toEqual({
      valid: true,
      claims: {
        version: 2,
        audience: "eventflow-scanner",
        ...CLAIMS,
        issuedAt: 1_000,
        expiresAt: 1_000 + SCANNER_SIGNED_TOKEN_TTL_MS,
      },
    });
  });

  it("avvisar manipulerad payload och signatur", async () => {
    const token = await createScannerSignedToken(CLAIMS, SECRET, 1_000);
    const [prefix, payload, signature] = token.split(".");
    const changedSignature = `${
      signature![0] === "A" ? "B" : "A"
    }${signature!.slice(1)}`;

    await expect(
      verifyScannerSignedToken(
        `${prefix}.${payload}A.${signature}`,
        SECRET,
        2_000
      )
    ).resolves.toMatchObject({ valid: false, reason: "bad_signature" });
    await expect(
      verifyScannerSignedToken(
        `${prefix}.${payload}.${changedSignature}`,
        SECRET,
        2_000
      )
    ).resolves.toMatchObject({ valid: false });
  });

  it("avvisar fel nyckel och utgången token", async () => {
    const token = await createScannerSignedToken(CLAIMS, SECRET, 1_000);
    await expect(
      verifyScannerSignedToken(
        token,
        "different-secret-with-at-least-32-bytes",
        2_000
      )
    ).resolves.toMatchObject({ valid: false, reason: "bad_signature" });
    await expect(
      verifyScannerSignedToken(
        token,
        SECRET,
        1_000 + SCANNER_SIGNED_TOKEN_TTL_MS
      )
    ).resolves.toMatchObject({ valid: false, reason: "expired" });
  });

  it("kräver separat stark secret och exakta ID:n", async () => {
    expect(scannerSigningSecretReady(undefined)).toBe(false);
    expect(
      scannerSigningSecretReady(
        "x".repeat(MIN_SCANNER_SIGNING_SECRET_BYTES - 1)
      )
    ).toBe(false);
    expect(
      scannerSigningSecretReady("x".repeat(MIN_SCANNER_SIGNING_SECRET_BYTES))
    ).toBe(true);
    await expect(
      createScannerSignedToken(CLAIMS, "kort", 1_000)
    ).rejects.toThrow(/32 bytes/u);
    await expect(
      createScannerSignedToken(
        { ...CLAIMS, organizationId: " org-1" },
        SECRET,
        1_000
      )
    ).rejects.toThrow(/canonical/u);
  });

  it("tillåter inte tokens längre än 24 timmar", async () => {
    await expect(
      createScannerSignedToken(CLAIMS, SECRET, 1_000, 24 * 60 * 60 * 1000 + 1)
    ).rejects.toThrow(/lifetime/u);
  });

  it("avvisar token utan kanonisk release-SHA", async () => {
    await expect(
      createScannerSignedToken(
        { ...CLAIMS, releaseSha: "main" },
        SECRET,
        1_000,
      ),
    ).rejects.toThrow(/canonical/u);
  });

  it("binder credentialen till exakt driftsatt release", async () => {
    const releaseSha = "a".repeat(40);
    expect(scannerReleaseMatches({ releaseSha }, releaseSha)).toBe(true);
    expect(scannerReleaseMatches({ releaseSha }, "b".repeat(40))).toBe(false);
    expect(scannerReleaseMatches({ releaseSha }, "main")).toBe(false);
    expect(scannerReleaseMatches({ releaseSha }, undefined)).toBe(false);
  });

  it("är additivt inkopplad utan service-role som nyckelfallback", () => {
    const login = readFileSync(
      "supabase/functions/mobile-app-auth/index.ts",
      "utf8"
    );
    const scannerApi = readFileSync(
      "supabase/functions/scanner-api/index.ts",
      "utf8"
    );

    expect(login).toContain("Deno.env.get('SCANNER_TOKEN_SIGNING_SECRET')");
    expect(login).toContain("scanner_token: scannerToken");
    expect(login).toContain("token, scanner_token");
    expect(login).toContain("scannerSigningSecretReady(scannerSigningSecret)");
    expect(login).toContain("Scanner authentication unavailable");
    expect(
      login.indexOf("scannerToken = await createScannerSignedToken(")
    ).toBeLessThan(login.indexOf("active_mobile_session_id: sessionId"));
    expect(login).not.toContain("scanner_token: null");
    expect(login).not.toMatch(
      /SCANNER_TOKEN_SIGNING_SECRET[^\n]*SUPABASE_SERVICE_ROLE_KEY/u
    );
    expect(scannerApi).toContain("verifyScannerSignedToken(");
    expect(scannerApi).toContain("AUTH_SIGNED_SCANNER_TOKEN_REQUIRED");
    expect(scannerApi).toContain("tenant_mismatch");
    expect(scannerApi).toContain("SCANNER_RELEASE_SHA");
    expect(login).toContain("SCANNER_RELEASE_SHA");
    expect(scannerApi).toContain("release_mismatch");
  });
});
