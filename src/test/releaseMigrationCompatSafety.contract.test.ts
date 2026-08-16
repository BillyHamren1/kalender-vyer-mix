/**
 * STEG 5A — safety-kontrakt för release_migration_compatibility-harnessen.
 *
 * Statisk analys av run-compat.sh + rapportintegritet. Ingen riktig databas.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runner = fs.readFileSync(
  path.resolve(root, 'scripts/sync-e2e/release-migration-compat/run-compat.sh'),
  'utf8',
);
const reportPath = path.resolve(root, 'reports/sync-release-migration-compatibility.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Kommentarsrader räknas inte som körbar SQL/mutation.
const executable = runner
  .split('\n')
  .map((l) => (l.trim().startsWith('#') ? '' : l))
  .join('\n');
const idx = (needle: string) => executable.indexOf(needle);

describe('STEG 5A — fail-closed safety före mutationer', () => {
  it('återanvänder befintlig preflight istället för egna production-markörer', () => {
    expect(runner).toContain('scripts/preflight-sync-e2e.sh');
    expect(runner).not.toContain('pihrhltinhewhoxefjxv');
    expect(runner).not.toContain('planning.e-flow.se');
  });

  it('preflight körs FÖRE all CREATE/DROP DATABASE och all SQL', () => {
    const preflight = idx('bash scripts/preflight-sync-e2e.sh');
    expect(preflight).toBeGreaterThan(-1);
    for (const mutation of ['CREATE DATABASE', 'DROP DATABASE', 'fixture.sql', 'bootstrap_supabase_shim.sql']) {
      expect(idx(mutation), mutation).toBeGreaterThan(preflight);
    }
  });

  it('kräver E2E_ENVIRONMENT=local och stannar före mutation annars', () => {
    expect(runner).toMatch(/E2E_ENVIRONMENT:-\}"\s*!=\s*"local"/);
    const localGate = runner.indexOf('LOCAL-ONLY');
    expect(localGate).toBeGreaterThan(-1);
    expect(idx('CREATE DATABASE')).toBeGreaterThan(localGate);
  });

  it('kräver explicit E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP=true', () => {
    expect(runner).toContain('E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP');
    const flagGate = idx('E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP:-}');
    expect(flagGate).toBeGreaterThan(-1);
    expect(idx('CREATE DATABASE')).toBeGreaterThan(flagGate);
  });

  it('test/staging/prod kan aldrig nå create/drop (endast local passerar)', () => {
    // Enda tillåtna värdet i gaten är "local"; inga andra miljöer allowlistas.
    expect(runner).not.toMatch(/E2E_ENVIRONMENT.*==.*"(test|staging|production|prod|live)"/);
  });

  it('vid failad preflight: mutations_executed=false och non-zero exit', () => {
    expect(runner).toContain('MUTATIONS_EXECUTED=false');
    expect(runner).toContain('NO MUTATIONS EXECUTED');
    expect(runner).toMatch(/fail_closed .*10|fail_closed .*20/);
    // MUTATIONS_EXECUTED sätts till true först efter lyckad CREATE DATABASE
    expect(idx('MUTATIONS_EXECUTED=true')).toBeGreaterThan(idx('CREATE DATABASE $db'));
  });
});

describe('STEG 5A — scratch-databaser och cleanup', () => {
  it('inga fasta databasnamn kvar', () => {
    expect(runner).not.toContain('compat_legacy_unique_as_constraint');
    expect(runner).not.toContain('compat_legacy_unique_as_index');
  });

  it('unikt run-id med strikt prefix', () => {
    expect(runner).toContain('RUN_ID=');
    expect(runner).toContain('DB_PREFIX="ef_sync_compat_${RUN_ID}"');
    expect(runner).toContain('local db="${DB_PREFIX}_${variant}"');
  });

  it('ingen DROP DATABASE före CREATE och ingen prefix-wide cleanup', () => {
    expect(runner).not.toMatch(/DROP DATABASE IF EXISTS \$db"[\s\S]{0,200}CREATE DATABASE \$db/);
    expect(runner).not.toMatch(/datname LIKE|pg_database.*LIKE/);
  });

  it('cleanup droppar endast databaser skapade av denna run', () => {
    expect(runner).toContain('CREATED_DBS+=("$db")');
    expect(runner).toContain('"${DB_PREFIX}_"*)');
    expect(runner).toContain('cleanup skipped (unexpected name)');
  });

  it('trap-baserad cleanup för exit, INT och TERM', () => {
    expect(runner).toContain('trap cleanup_scratch EXIT');
    expect(runner).toContain('trap on_signal INT TERM');
  });
});

describe('STEG 5A — rapportintegritet och evidens', () => {
  it('rapporten har all körmetadata', () => {
    for (const key of [
      'generated_at',
      'safe_environment',
      'environment',
      'mutations_executed',
      'cleanup_status',
      'scope_size',
      'variants_executed',
      'classification',
      'evidence_txt',
      'first_failure',
      'sqlstate',
      'setup_steps',
      'migrations_expected',
      'migrations_not_executed',
    ]) {
      expect(Object.keys(report), key).toContain(key);
    }
  });

  it('PASS kräver safe_environment=PASS och full räkning', () => {
    if (report.classification !== 'COMPATIBILITY_PASS') return;
    expect(report.safe_environment).toBe('PASS');
    expect(report.environment).toBe('local');
    expect(report.migrations_executed).toBe(report.migrations_expected);
    expect(report.migrations_passed).toBe(report.migrations_expected);
    expect(report.migrations_failed).toBe(0);
    expect(report.migrations_not_executed).toBe(0);
    for (const s of report.setup_steps) expect(s.result, s.step).toBe('PASS');
  });

  it('FAIL kräver en icke-null first_failure', () => {
    if (report.classification === 'COMPATIBILITY_FAIL') {
      expect(report.first_failure).toBeTruthy();
    }
    expect(runner).toContain('FIRST_FAILURE="${FIRST_FAILURE:-unknown}"');
  });

  it('exporterbar .txt-evidens finns och pekas ut från JSON', () => {
    expect(report.evidence_txt).toBe('reports/sync-release-migration-compatibility.txt');
    expect(report.log).toBe('reports/sync-release-migration-compatibility.log');
    const txt = path.resolve(root, report.evidence_txt);
    expect(fs.existsSync(txt), 'evidence .txt saknas').toBe(true);
    expect(fs.readFileSync(txt, 'utf8').length).toBeGreaterThan(100);
  });

  it('inga credentials i rapport eller evidens', () => {
    const blob =
      JSON.stringify(report) + fs.readFileSync(path.resolve(root, report.evidence_txt), 'utf8');
    expect(blob).not.toMatch(/postgres(ql)?:\/\/[^\s"]*:[^\s"@]+@/);
    expect(blob).not.toMatch(/service_role_key|SERVICE_ROLE_KEY|eyJhbGciOi/);
    expect(blob).not.toMatch(/PGPASSWORD|password=/i);
  });

  it('compatibility påverkar fortfarande inte den fail-closed SQL/E2E-gaten', () => {
    const gate = fs.readFileSync(path.resolve(root, 'scripts/sync-e2e/gate.mjs'), 'utf8');
    expect(gate).not.toContain('compatibility');
  });
});
