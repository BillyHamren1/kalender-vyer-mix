import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SCANNER_CONTRACT_HEADER,
  SCANNER_CONTRACT_VERSION,
  parseScannerAllowedOrigins,
  preflightsScannerContract,
  requestsScannerContract,
  scannerCorsHeaders,
} from "../../supabase/functions/_shared/scannerCors";

const ALLOWED = "https://scanner.example.test,http://localhost";

function request(headers: Record<string, string>): Request {
  return new Request("https://planning.example.test/scanner-api", { headers });
}

describe("Scanner v2 CORS boundary", () => {
  it("tillåter server-till-server utan att returnera wildcard", () => {
    expect(scannerCorsHeaders(null, undefined, false)).toEqual({
      allowed: true,
      headers: expect.not.objectContaining({ "Access-Control-Allow-Origin": expect.anything() }),
    });
  });

  it("returnerar endast exakt tillåten browser-origin", () => {
    const result = scannerCorsHeaders("https://scanner.example.test", ALLOWED, false);
    expect(result.allowed).toBe(true);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe(
      "https://scanner.example.test",
    );
    expect(result.headers.Vary).toBe("Origin");
  });

  it("stoppar okänd origin och failar stängt utan konfiguration", () => {
    expect(scannerCorsHeaders("https://evil.example", ALLOWED, false).allowed).toBe(false);
    expect(
      scannerCorsHeaders("https://scanner.example.test", undefined, false).allowed,
    ).toBe(false);
  });

  it("ignorerar wildcard, credentials, path och icke-webbscheman i konfiguration", () => {
    expect(
      [...parseScannerAllowedOrigins(
        "*,https://user:pass@example.test,https://example.test/path,capacitor://localhost,http://localhost",
      )],
    ).toEqual(["http://localhost"]);
  });

  it("identifierar Scanner-huvudet i faktisk request och preflight", () => {
    expect(
      requestsScannerContract(
        request({ [SCANNER_CONTRACT_HEADER]: SCANNER_CONTRACT_VERSION }),
      ),
    ).toBe(true);
    expect(
      preflightsScannerContract(
        request({
          "Access-Control-Request-Headers":
            "content-type, X-EventFlow-Scanner-Contract, authorization",
        }),
      ),
    ).toBe(true);
  });

  it("bevarar legacy-wildcard endast när anropande endpoint väljer legacy", () => {
    const result = scannerCorsHeaders("https://legacy.example", undefined, true);
    expect(result.allowed).toBe(true);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("kopplar credential-utgivning och server-side read-only till Scanner-gränsen", () => {
    const login = readFileSync(
      "supabase/functions/mobile-app-auth/index.ts",
      "utf8",
    );
    const api = readFileSync("supabase/functions/scanner-api/index.ts", "utf8");

    expect(login).toContain("issueScannerCredential");
    expect(login).toContain("SCANNER_ALLOWED_ORIGINS");
    expect(login).toMatch(/issueScannerCredential\s*\?\s*json\([^)]*scanner_token/su);
    expect(api).toContain("SCANNER_CONTRACT_READ_ACTIONS");
    expect(api).toContain("SCANNER_PLANNING_MUTATION_FORBIDDEN");
    expect(api).toContain("SCANNER_CONTRACT_VERSION_MISMATCH");
    expect(api).toContain("SCANNER_ALLOWED_ORIGINS");
  });
});
