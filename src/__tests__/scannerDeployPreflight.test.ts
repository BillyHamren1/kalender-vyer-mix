import { execFileSync, spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const values = {
  SUPABASE_PROJECT_REF: "pihrhltinhewhoxefjxv",
  BUNDLE_WMS_PROJECT_REF: "pnvvnvywphfvmwdmqqzs",
  SCANNER_APP_URL: "https://scanner.eventflow.se",
  SCANNER_ALLOWED_ORIGINS: "https://scanner.eventflow.se/",
  SCANNER_TOKEN_SIGNING_SECRET: "scanner-signing-secret-32-bytes-minimum",
  BUNDLE_SUPABASE_FUNCTIONS_URL:
    "https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1",
  EVENTFLOW_SCANNER_BUNDLE_SECRET:
    "scanner-bundle-secret-32-bytes-minimum",
  SCANNER_RELEASE_MODE: "read_only",
  SCANNER_DEPLOY_FUNCTIONS: "scanner-api,mobile-app-auth",
  SCANNER_RELEASE_SHA: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
};

function run(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/scanner-deploy-preflight.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, ...values, ...overrides },
    encoding: "utf8",
  });
}

describe("Planning Scanner deploy-preflight", () => {
  it("godkänner ett isolerat read-pilot-paket utan att skriva värden", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS: Planning-funktionspaketet");
    for (const secret of Object.values(values))
      expect(result.stdout).not.toContain(secret);
  });

  it("spärrar wildcard, fel WMS-projekt och återanvänd hemlighet", () => {
    const result = run({
      BUNDLE_WMS_PROJECT_REF: "fel-wms",
      SCANNER_ALLOWED_ORIGINS: "*",
      EVENTFLOW_SCANNER_BUNDLE_SECRET: values.SCANNER_TOKEN_SIGNING_SECRET,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BLOCKED BUNDLE_WMS_PROJECT_REF");
    expect(result.stdout).toContain("BLOCKED SCANNER_ALLOWED_ORIGINS");
    expect(result.stdout).toContain("BLOCKED SCANNER_SECRET_ISOLATION");
  });

  it("spärrar fel Bundle-URL eller för kort delad hemlighet", () => {
    const result = run({
      BUNDLE_SUPABASE_FUNCTIONS_URL: "https://wrong.example/functions/v1",
      EVENTFLOW_SCANNER_BUNDLE_SECRET: "short",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BLOCKED BUNDLE_SUPABASE_FUNCTIONS_URL");
    expect(result.stdout).toContain("BLOCKED EVENTFLOW_SCANNER_BUNDLE_SECRET");
  });

  it("spärrar hela originlistan om en enda post är ogiltig", () => {
    const result = run({
      SCANNER_ALLOWED_ORIGINS:
        "https://scanner.eventflow.se,https://scanner.eventflow.se/path",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BLOCKED SCANNER_ALLOWED_ORIGINS");
  });

  it("bevisar att Scanner-funktionernas Supabase-klient är versionslåst", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS SCANNER_EDGE_DEPENDENCIES_PINNED");
  });

  it("spärrar generisk eller muterande funktionsdeployment", () => {
    const result = run({
      SCANNER_DEPLOY_FUNCTIONS:
        "scanner-api,mobile-app-auth,scanner-operation-v2",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BLOCKED SCANNER_DEPLOY_FUNCTION_ALLOWLIST");
    expect(result.stdout).toContain(
      "BLOCKED SCANNER_FORBIDDEN_FUNCTIONS_EXCLUDED",
    );
  });

  it("spärrar read-pilot om release mode försöker aktivera mutationer", () => {
    const result = run({ SCANNER_RELEASE_MODE: "mutating" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BLOCKED SCANNER_RELEASE_MODE");
  });

  it("spärrar annan eller icke-kanonisk release-SHA", () => {
    for (const releaseSha of ["0".repeat(40), "E".repeat(40), "main"]) {
      const result = run({ SCANNER_RELEASE_SHA: releaseSha });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("BLOCKED SCANNER_RELEASE_SHA");
    }
  });
});
