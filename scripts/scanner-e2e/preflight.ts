/**
 * SCANNER HARDENING – STEG 15B: FAIL-CLOSED PREFLIGHT.
 *
 * Gör INGA mutationer. Avgör bara om det finns en godkänd LOCAL/TEST-miljö
 * (byggd i steg 15A) att köra scanner-E2E mot. Saknas den → abort, exit 10,
 * NO MUTATIONS EXECUTED.
 */

/** Kända produktionsmarkörer. Får ALDRIG köras mot. */
export const PROD_MARKERS = [
  'pihrhltinhewhoxefjxv',
  'planning.e-flow.se',
  'kalender-vyer-mix.lovable.app',
];

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface PreflightResult {
  ok: boolean;
  runId: string | null;
  checks: PreflightCheck[];
  abortReason: string | null;
  /** 0 = ok, 10 = ingen säker konfiguration, 20 = produktionsmarkör. */
  exitCode: 0 | 10 | 20;
}

export interface PreflightEnv {
  SCANNER_E2E_SAFE_TEST_ENV?: string;
  SCANNER_E2E_ENVIRONMENT?: string;
  SCANNER_E2E_WMS_URL?: string;
  SCANNER_E2E_WMS_APPROVED_TEST_TARGET?: string;
  SCANNER_E2E_PLANNING_URL?: string;
  SCANNER_E2E_ALLOW_MUTATIONS?: string;
  SCANNER_E2E_FIXTURE_ORG_ID?: string;
  SCANNER_E2E_ENABLE_V2_FOR_RUN?: string;
  SCANNER_E2E_RUN_ID?: string;
}

const containsProdMarker = (value: string | undefined): string | null => {
  if (!value) return null;
  const hit = PROD_MARKERS.find((m) => value.includes(m));
  return hit ?? null;
};

export const runPreflight = (env: PreflightEnv): PreflightResult => {
  const checks: PreflightCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) =>
    checks.push({ id, label, ok, detail });

  const environment = (env.SCANNER_E2E_ENVIRONMENT ?? '').toLowerCase();

  add(
    'safe_env_flag',
    'Explicit bekräftelse SCANNER_E2E_SAFE_TEST_ENV=true',
    env.SCANNER_E2E_SAFE_TEST_ENV === 'true',
    env.SCANNER_E2E_SAFE_TEST_ENV ?? 'saknas',
  );
  add(
    'environment_local_or_test',
    'Environment är LOCAL eller TEST',
    environment === 'local' || environment === 'test',
    environment || 'saknas',
  );
  add(
    'wms_target_approved',
    'WMS target är uttryckligen godkänd testmiljö',
    Boolean(env.SCANNER_E2E_WMS_URL) &&
      env.SCANNER_E2E_WMS_APPROVED_TEST_TARGET === 'true',
    env.SCANNER_E2E_WMS_URL ? 'url satt' : 'url saknas',
  );
  add(
    'planning_target_test',
    'Planning target är test/local',
    Boolean(env.SCANNER_E2E_PLANNING_URL),
    env.SCANNER_E2E_PLANNING_URL ?? 'saknas',
  );
  add(
    'v2_enabled_for_run_only',
    'SCANNER_TRANSACTION_V2 aktiveras endast för denna testkörning',
    env.SCANNER_E2E_ENABLE_V2_FOR_RUN === 'true',
    env.SCANNER_E2E_ENABLE_V2_FOR_RUN ?? 'saknas',
  );
  add(
    'mutations_opt_in',
    'Scanner-mutationer kräver explicit opt-in',
    env.SCANNER_E2E_ALLOW_MUTATIONS === 'true',
    env.SCANNER_E2E_ALLOW_MUTATIONS ?? 'saknas',
  );
  add(
    'fixture_org',
    'Test organization är fixture-org',
    Boolean(env.SCANNER_E2E_FIXTURE_ORG_ID?.startsWith('fixture-')),
    env.SCANNER_E2E_FIXTURE_ORG_ID ?? 'saknas',
  );

  const prodHit =
    containsProdMarker(env.SCANNER_E2E_WMS_URL) ??
    containsProdMarker(env.SCANNER_E2E_PLANNING_URL) ??
    containsProdMarker(env.SCANNER_E2E_FIXTURE_ORG_ID);
  add(
    'no_production_identifiers',
    'Inga produktionsidentifierare förekommer',
    prodHit === null,
    prodHit ? `produktionsmarkör: ${prodHit}` : 'inga',
  );

  const runId = env.SCANNER_E2E_RUN_ID ?? null;
  add(
    'unique_run_id',
    'Run-id är unikt och satt',
    Boolean(runId && /^scanner-e2e-[a-z0-9-]{6,}$/i.test(runId)),
    runId ?? 'saknas',
  );

  const failed = checks.filter((c) => !c.ok);
  if (prodHit) {
    return {
      ok: false,
      runId,
      checks,
      abortReason: `PRODUCTION TARGET BLOCKED (${prodHit})`,
      exitCode: 20,
    };
  }
  if (failed.length > 0) {
    return {
      ok: false,
      runId,
      checks,
      abortReason: `SAFE TEST CONFIGURATION NOT PROVIDED (${failed.map((f) => f.id).join(', ')})`,
      exitCode: 10,
    };
  }
  return { ok: true, runId, checks, abortReason: null, exitCode: 0 };
};
