#!/usr/bin/env node
/**
 * STEG 4S – Fail-closed gate-logik för SQL/E2E-runnern.
 *
 * POLICY (exakt):
 *   - GREEN ges ENDAST om safe_environment === "PASS" OCH samtliga required
 *     sections är exakt "PASS".
 *   - Om safe_environment !== "PASS" → "NOT EXECUTED" (gaten kunde aldrig köras,
 *     inga mutationer utfördes). Exit 10.
 *   - Om safe_environment === "PASS" men någon required section är "FAIL" → "RED".
 *   - Om safe_environment === "PASS" men någon required section är
 *     "NOT EXECUTED" (t.ex. migrations när E2E_ALLOW_MIGRATION_RESET != true)
 *     → "RED". Efter godkänd preflight SKA allt köras; utebliven körning är ett
 *     gate-fel, inte ett neutralt tillstånd.
 *   - Okänt/tomt värde behandlas som "RED" (fail-closed).
 */

export const REQUIRED_SECTIONS = [
  "migrations",
  "bsa_tenant_identity",
  "bsa_v2_rpc",
  "security_definer",
  "revision_lease",
  "worker_jobs",
  "batch_cursor",
  "warehouse_uniqueness",
  "canonical_error_propagation",
  "destructive_cancellation_off",
];

export function computeFinalGate(input) {
  const safe = String(input?.safe_environment ?? "").trim();
  const results = input?.results ?? {};
  const reasons = [];

  if (safe !== "PASS") {
    return {
      final: "NOT EXECUTED",
      exit_code: 10,
      reasons: ["safe_environment != PASS – ingen säker testmiljö, inga mutationer utförda"],
    };
  }

  for (const key of REQUIRED_SECTIONS) {
    const value = String(results[key] ?? "").trim();
    if (value === "PASS") continue;
    if (value === "FAIL") reasons.push(`${key}: FAIL`);
    else if (value === "NOT EXECUTED") reasons.push(`${key}: NOT EXECUTED efter godkänd preflight`);
    else reasons.push(`${key}: okänt värde "${value}"`);
  }

  if (reasons.length > 0) return { final: "RED", exit_code: 1, reasons };
  return { final: "GREEN", exit_code: 0, reasons: [] };
}

// CLI: läser JSON på stdin, skriver JSON på stdout, exit = exit_code.
if (process.argv[1] && process.argv[1].endsWith("gate.mjs")) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      process.stdout.write(
        JSON.stringify({ final: "RED", exit_code: 1, reasons: ["invalid gate input json"] }),
      );
      process.exit(1);
    }
    const out = computeFinalGate(parsed);
    process.stdout.write(JSON.stringify(out));
    process.exit(out.exit_code);
  });
}
