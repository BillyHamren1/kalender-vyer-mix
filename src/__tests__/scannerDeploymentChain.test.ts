import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  ".github/workflows/scanner-deploy-read-only.yml",
  "utf8",
);
const supabaseConfig = readFileSync("supabase/config.toml", "utf8");

describe("Scanner read-only deployment chain", () => {
  it("deploys Planning reader before token issuer", () => {
    const scanner = source.indexOf("functions deploy scanner-api");
    const auth = source.indexOf("functions deploy mobile-app-auth");
    expect(scanner).toBeGreaterThan(0);
    expect(auth).toBeGreaterThan(scanner);
  });

  it("sets one isolated Bundle secret in both owner systems", () => {
    expect(source).toContain("EVENTFLOW_SCANNER_BUNDLE_SECRET");
    expect(source).toContain("BUNDLE_SUPABASE_FUNCTIONS_URL");
    expect(source).toContain("SCANNER_TOKEN_SIGNING_SECRET");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("PRICELIST_API_KEY");
  });

  it("deploys a hash-bound owner-repo Bundle snapshot before Planning", () => {
    const snapshotCheck = source.indexOf(
      "scanner-bundle-projection-release-v1.gitblob",
    );
    const bundleDeploy = source.indexOf(
      "functions deploy eventflow-scanner-projection-v1",
    );
    const scannerDeploy = source.indexOf("functions deploy scanner-api");
    expect(source).toMatch(/BUNDLE_RELEASE_SHA: [0-9a-f]{40}/u);
    expect(source).toContain('git hash-object "$path"');
    expect(source).not.toContain(
      "repository: BillyHamren1/bundle-builder-base",
    );
    expect(snapshotCheck).toBeGreaterThan(0);
    expect(bundleDeploy).toBeGreaterThan(snapshotCheck);
    expect(scannerDeploy).toBeGreaterThan(bundleDeploy);
  });

  it("cannot deploy mutation, migration or legacy", () => {
    expect(source).not.toMatch(/functions deploy scanner-operation-v2/u);
    expect(source).not.toMatch(/db push|migration up|functions deploy --/u);
    expect(source).not.toContain("packlist-flow-scanner");
  });

  it("lets the signed Scanner token reach the custom-auth MVP gateway", () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.scanner-command-api\]\s+verify_jwt\s*=\s*false/u,
    );
  });

  it("requires explicit manual dispatch", () => {
    expect(source).toContain("workflow_dispatch:");
    expect(source).not.toMatch(/\npush:/u);
  });
});
