import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scannerEdgeFunctionFiles = [
  "supabase/functions/mobile-app-auth/index.ts",
  "supabase/functions/scanner-api/index.ts",
];

const pinnedSupabaseJsImport =
  "https://esm.sh/@supabase/supabase-js@2.116.0";

const packageManifest = JSON.parse(
  readFileSync("package.json", "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("Scanner Edge Function dependency pin", () => {
  it.each(scannerEdgeFunctionFiles)(
    "%s uses the reviewed exact supabase-js artifact",
    (file) => {
      const source = readFileSync(file, "utf8");
      const imports = source.match(
        /https:\/\/esm\.sh\/@supabase\/supabase-js@[^'"]+/gu,
      );

      expect(imports).toEqual([pinnedSupabaseJsImport]);
    },
  );

  it("pins the reviewed test runner and rejects the unused legacy asset tool", () => {
    expect(packageManifest.dependencies?.vitest).toBe("3.2.7");
    expect(packageManifest.devDependencies?.["@capacitor/assets"]).toBeUndefined();
  });

  it("keeps the critical production audit fail-closed", () => {
    expect(packageManifest.scripts?.["scanner:production-audit"]).toBe(
      "npm audit --omit=dev --omit=optional --audit-level=critical",
    );
  });
});
