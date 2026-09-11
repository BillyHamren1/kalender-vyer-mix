import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  ".github/workflows/scanner-deploy-read-only.yml",
  "utf8",
);

describe("Scanner read-only deployment chain", () => {
  it("pins Bundle source and deploys Bundle before Planning", () => {
    expect(source).toContain(
      "ref: 9ea32de4e9a5642e7049f1282d428c164c1910f9",
    );
    const bundle = source.indexOf("functions deploy eventflow-scanner-projection-v1");
    const scanner = source.indexOf("functions deploy scanner-api");
    const auth = source.indexOf("functions deploy mobile-app-auth");
    expect(bundle).toBeGreaterThan(0);
    expect(scanner).toBeGreaterThan(bundle);
    expect(auth).toBeGreaterThan(scanner);
  });

  it("sets one isolated Bundle secret in both owner systems", () => {
    expect(source).toContain("EVENTFLOW_SCANNER_BUNDLE_SECRET");
    expect(source).toContain("BUNDLE_SUPABASE_FUNCTIONS_URL");
    expect(source).toContain("SCANNER_TOKEN_SIGNING_SECRET");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("PRICELIST_API_KEY");
  });

  it("cannot deploy mutation, migration or legacy", () => {
    expect(source).not.toMatch(/functions deploy scanner-operation-v2/u);
    expect(source).not.toMatch(/db push|migration up|functions deploy --/u);
    expect(source).not.toContain("packlist-flow-scanner");
  });

  it("requires explicit manual dispatch", () => {
    expect(source).toContain("workflow_dispatch:");
    expect(source).not.toMatch(/\npush:/u);
  });
});
