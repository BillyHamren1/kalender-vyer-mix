import { describe, expect, it } from "vitest";

import {
  SCANNER_CONTRACT_HEADER,
  SCANNER_CONTRACT_VERSION,
  SCANNER_RELEASE_HEADER,
  scannerContractResponseHeaders,
} from "../../supabase/functions/_shared/scannerCors";

describe("Scanner contract response proof", () => {
  it("echoes the exact negotiated version without weakening existing CORS", () => {
    const releaseSha = "a".repeat(40);
    const result = scannerContractResponseHeaders(
      {
        "Access-Control-Allow-Origin": "https://scanner.eventflow.se",
        Vary: "Origin",
      },
      releaseSha,
    );

    expect(result[SCANNER_CONTRACT_HEADER]).toBe(SCANNER_CONTRACT_VERSION);
    expect(result["Access-Control-Expose-Headers"]).toContain(SCANNER_CONTRACT_HEADER);
    expect(result["Access-Control-Expose-Headers"]).toContain(SCANNER_RELEASE_HEADER);
    expect(result[SCANNER_RELEASE_HEADER]).toBe(releaseSha);
    expect(result["Access-Control-Allow-Origin"]).toBe("https://scanner.eventflow.se");
    expect(result.Vary).toBe("Origin");
  });

  it("does not mutate the caller's header object", () => {
    const input = { "Cache-Control": "no-store" };
    scannerContractResponseHeaders(input);
    expect(input).toEqual({ "Cache-Control": "no-store" });
  });
});
