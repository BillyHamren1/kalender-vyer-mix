import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Låser att preflight-kontrollen (WMS-koppling på packningssidan) inte
 * exponerar supabase-js råa engelska nätverksfel ("Failed to send a request
 * to the Edge Function") mot användaren. FunctionsFetchError ska ge ett
 * automatiskt omförsök och ett svenskt, begripligt felmeddelande.
 */

const scannerService = readFileSync(
  join(__dirname, "../services/scannerService.ts"),
  "utf8",
);

describe("packing preflight network resilience (static)", () => {
  it("gör automatiskt omförsök vid FunctionsFetchError", () => {
    expect(scannerService).toContain("isFunctionsFetchError");
    expect(scannerService).toContain("'FunctionsFetchError'");
    // Retry-loopen ska finnas i invokePreflightWithRetry
    expect(scannerService).toContain("invokePreflightWithRetry");
    expect(scannerService).toMatch(/for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
  });

  it("visar svenskt felmeddelande istället för rå engelsk text", () => {
    expect(scannerService).toContain(
      "Kunde inte nå servern. Kontrollera din internetanslutning och försök igen.",
    );
  });

  it("kastar bara nätverksfelet efter slutgiltigt misslyckat omförsök", () => {
    const retryBlock = scannerService.slice(
      scannerService.indexOf("invokePreflightWithRetry = async"),
      scannerService.indexOf("export const runPackingPreflightCheck"),
    );
    // Icke-nätverksfel ska kastas direkt utan omförsök
    expect(retryBlock).toContain("if (!isFunctionsFetchError(error))");
    expect(retryBlock).toContain("throw new Error(error.message || 'Preflight failed')");
    expect(retryBlock).toContain("throw new Error(PREFLIGHT_NETWORK_ERROR_MESSAGE)");
  });

  it("runPackingPreflightCheck går genom retry-hjälparen", () => {
    const runBlock = scannerService.slice(
      scannerService.indexOf("export const runPackingPreflightCheck"),
    );
    expect(runBlock).toContain("invokePreflightWithRetry('packing-preflight-check'");
  });
});
