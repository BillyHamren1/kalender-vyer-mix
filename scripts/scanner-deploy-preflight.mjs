import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PLANNING_PROJECT_REF = "pihrhltinhewhoxefjxv";
const BUNDLE_PROJECT_REF = "pnvvnvywphfvmwdmqqzs";
const RELEASE_MANIFEST_PATH =
  "supabase/scanner-read-pilot-release-v1.json";

const env = process.env;
const value = (key) => env[key]?.trim() ?? "";
const checks = [];
const add = (key, ok) => checks.push({ key, ok });

function exactHttpsOrigin(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

const scannerOrigin = exactHttpsOrigin(value("SCANNER_APP_URL"));
const rawAllowedOrigins = value("SCANNER_ALLOWED_ORIGINS")
  .split(",")
  .map((candidate) => candidate.trim())
  .filter(Boolean);
const allowedOrigins = rawAllowedOrigins.map(exactHttpsOrigin);
const signingSecret = value("SCANNER_TOKEN_SIGNING_SECRET");
const bundleFunctionsUrl = value("BUNDLE_SUPABASE_FUNCTIONS_URL");
const bundleSecret = value("EVENTFLOW_SCANNER_BUNDLE_SECRET");
const serviceRole = value("SUPABASE_SERVICE_ROLE_KEY");
const requestedDeployFunctions = value("SCANNER_DEPLOY_FUNCTIONS")
  .split(",")
  .map((candidate) => candidate.trim())
  .filter(Boolean);

let releaseManifest = null;
try {
  releaseManifest = JSON.parse(readFileSync(RELEASE_MANIFEST_PATH, "utf8"));
} catch {
  releaseManifest = null;
}

const manifestFunctions = Array.isArray(releaseManifest?.functions)
  ? releaseManifest.functions.map((entry) => entry?.name)
  : [];
const expectedFunctionManifest = [
  { name: "scanner-api", order: 1, verify_jwt: false },
  { name: "mobile-app-auth", order: 2, verify_jwt: false },
];
const forbiddenFunctions = Array.isArray(releaseManifest?.forbidden_functions)
  ? releaseManifest.forbidden_functions
  : [];
let checkedOutCommit = null;
try {
  checkedOutCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  checkedOutCommit = null;
}

const scannerEdgeFunctionFiles = [
  "supabase/functions/mobile-app-auth/index.ts",
  "supabase/functions/scanner-api/index.ts",
];
const pinnedSupabaseJsImport =
  "https://esm.sh/@supabase/supabase-js@2.116.0";

add(
  "SUPABASE_PROJECT_REF",
  value("SUPABASE_PROJECT_REF") === PLANNING_PROJECT_REF
);
add(
  "BUNDLE_WMS_PROJECT_REF",
  value("BUNDLE_WMS_PROJECT_REF") === BUNDLE_PROJECT_REF
);
add("SCANNER_APP_URL", scannerOrigin !== null);
add(
  "SCANNER_ALLOWED_ORIGINS",
  Boolean(
    scannerOrigin &&
      allowedOrigins.includes(scannerOrigin) &&
      rawAllowedOrigins.length > 0 &&
      rawAllowedOrigins.every((candidate) => candidate !== "*") &&
      allowedOrigins.every(Boolean)
  )
);
add(
  "SCANNER_TOKEN_SIGNING_SECRET",
  new TextEncoder().encode(signingSecret).length >= 32
);
add(
  "BUNDLE_SUPABASE_FUNCTIONS_URL",
  bundleFunctionsUrl ===
    `https://${BUNDLE_PROJECT_REF}.supabase.co/functions/v1`
);
add(
  "EVENTFLOW_SCANNER_BUNDLE_SECRET",
  new TextEncoder().encode(bundleSecret).length >= 32
);
add(
  "SCANNER_SECRET_ISOLATION",
  Boolean(
    signingSecret &&
      bundleSecret &&
      signingSecret !== bundleSecret &&
      (!serviceRole ||
        (signingSecret !== serviceRole && bundleSecret !== serviceRole))
  )
);
add(
  "SCANNER_RELEASE_MANIFEST",
  Boolean(
    releaseManifest?.release_contract ===
      "scanner_read_pilot_release_v1" &&
      releaseManifest?.mode === "read_only" &&
      releaseManifest?.planning_project_ref === PLANNING_PROJECT_REF &&
      releaseManifest?.bundle_wms_project_ref === BUNDLE_PROJECT_REF &&
      releaseManifest?.migrations === "forbidden" &&
      releaseManifest?.physical_mutations === "forbidden" &&
      releaseManifest?.release_binding === "git_sha" &&
      JSON.stringify(releaseManifest?.functions) ===
        JSON.stringify(expectedFunctionManifest) &&
      JSON.stringify(forbiddenFunctions) ===
        JSON.stringify(["scanner-operation-v2"])
  )
);
add(
  "SCANNER_RELEASE_SHA",
  Boolean(
    checkedOutCommit &&
      /^[0-9a-f]{40}$/u.test(checkedOutCommit) &&
      value("SCANNER_RELEASE_SHA") === checkedOutCommit
  )
);
add(
  "SCANNER_RELEASE_MODE",
  value("SCANNER_RELEASE_MODE") === releaseManifest?.mode
);
add(
  "SCANNER_DEPLOY_FUNCTION_ALLOWLIST",
  JSON.stringify(requestedDeployFunctions) ===
    JSON.stringify(manifestFunctions)
);
add(
  "SCANNER_FORBIDDEN_FUNCTIONS_EXCLUDED",
  forbiddenFunctions.length > 0 &&
    forbiddenFunctions.every(
      (functionName) => !requestedDeployFunctions.includes(functionName)
    )
);

const requiredFiles = [
  RELEASE_MANIFEST_PATH,
  "supabase/functions/mobile-app-auth/index.ts",
  "supabase/functions/scanner-api/index.ts",
  "supabase/functions/_shared/scannerSignedAuth.ts",
  "supabase/functions/_shared/scannerCors.ts",
  "supabase/functions/_shared/scannerReadContractV1.ts",
  "supabase/functions/_shared/scannerBundleProjection.ts",
];
add(
  "SCANNER_FUNCTION_BUNDLE",
  requiredFiles.every((file) => existsSync(file))
);
add(
  "SCANNER_EDGE_DEPENDENCIES_PINNED",
  scannerEdgeFunctionFiles.every((file) => {
    if (!existsSync(file)) return false;
    const source = readFileSync(file, "utf8");
    const imports = source.match(
      /https:\/\/esm\.sh\/@supabase\/supabase-js@[^'"]+/gu
    );
    return imports?.length === 1 && imports[0] === pinnedSupabaseJsImport;
  })
);

const config = readFileSync("supabase/config.toml", "utf8");
add(
  "MOBILE_APP_AUTH_CONFIG",
  /\[functions\.mobile-app-auth\]\s+verify_jwt = false/u.test(config)
);
add(
  "SCANNER_API_CONFIG",
  /\[functions\.scanner-api\]\s+verify_jwt = false/u.test(config)
);

console.log("Planning Scanner read-pilot deploy-preflight");
for (const item of checks)
  console.log(`${item.ok ? "PASS" : "BLOCKED"} ${item.key}`);

const blocked = checks.filter((item) => !item.ok);
if (blocked.length > 0) {
  console.error(`BLOCKED: ${blocked.length} deployvillkor återstår.`);
  process.exit(1);
}
console.log(
  "PASS: Planning-funktionspaketet är konfigurationsklart för read-pilot."
);
