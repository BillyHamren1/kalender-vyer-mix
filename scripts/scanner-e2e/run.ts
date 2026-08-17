/**
 * SCANNER HARDENING – STEG 15B: E2E-runner (fail-closed).
 *
 * Kör: bun run scripts/scanner-e2e/run.ts
 *
 * Utan godkänd LOCAL/TEST-miljö (steg 15A) aborteras körningen INNAN någon
 * mutation sker. Alla scenarier rapporteras då som NOT_EXECUTED och
 * slutstatus blir NOT GREEN.
 */

import fs from 'fs';
import path from 'path';
import { runPreflight, type PreflightResult } from './preflight';
import {
  SCENARIOS,
  isGreen,
  notExecutedResults,
  type ScenarioResult,
} from './scenarios';
import { executeScenarios } from './execute';

const REPORT_PATH = path.resolve(
  process.cwd(),
  'docs/scanner-e2e-report.md',
);

const renderReport = (
  preflight: PreflightResult,
  results: ScenarioResult[],
  green: boolean,
): string => {
  const lines: string[] = [];
  lines.push('# SCANNER HARDENING – STEG 15B: FULL SCANNER E2E RELIABILITY GATE');
  lines.push('');
  lines.push(`Genererad: ${new Date().toISOString()}`);
  lines.push(`Run-id: ${preflight.runId ?? '(inget)'}`);
  lines.push(`Slutstatus: **${green ? 'GREEN' : 'NOT GREEN'}**`);
  lines.push('');
  lines.push('## Preflight (fail-closed)');
  lines.push('');
  lines.push('| Kontroll | Status | Detalj |');
  lines.push('|---|---|---|');
  for (const c of preflight.checks) {
    lines.push(`| ${c.label} | ${c.ok ? 'OK' : 'BLOCKERAD'} | ${c.detail} |`);
  }
  lines.push('');
  if (!preflight.ok) {
    lines.push(`**ABORT:** ${preflight.abortReason}`);
    lines.push('');
    lines.push('**NO MUTATIONS EXECUTED**');
    lines.push('');
  }
  lines.push('## Scenarier');
  lines.push('');
  lines.push('| # | Scenario | Obligatoriskt | Status | Orsak |');
  lines.push('|---|---|---|---|---|');
  for (const s of SCENARIOS) {
    const r = results.find((x) => x.id === s.id);
    lines.push(
      `| ${s.specSection} | ${s.title} | ${s.mandatory ? 'ja' : 'nej'} | ${r?.status ?? 'NOT_EXECUTED'} | ${r?.reason ?? '-'} |`,
    );
  }
  lines.push('');
  const failures = results.filter((r) => r.status === 'FAIL');
  if (failures.length) {
    lines.push('## Failures (detalj)');
    lines.push('');
    for (const f of failures) {
      lines.push(`### ${f.id}`);
      lines.push(`- operation_id: ${f.operationId ?? '-'}`);
      lines.push(`- command: ${f.command ?? '-'}`);
      lines.push(`- device: ${f.device ?? '-'}`);
      lines.push(`- queue state: ${f.queueState ?? '-'}`);
      lines.push(`- API-resultat: ${f.apiResult ?? '-'}`);
      lines.push(`- WMS authoritative: ${f.wmsState ?? '-'}`);
      lines.push(`- Planning projection: ${f.planningProjection ?? '-'}`);
      lines.push(`- UI final state: ${f.uiState ?? '-'}`);
      lines.push(`- mismatch: ${f.mismatch ?? '-'}`);
      lines.push('');
    }
  }
  lines.push('## Regel');
  lines.push('');
  lines.push('NOT_EXECUTED räknas ALDRIG som PASS. Sviten är GREEN endast när samtliga');
  lines.push('obligatoriska scenarier är PASS.');
  lines.push('');
  return lines.join('\n');
};

const main = async () => {
  const preflight = runPreflight(process.env as never);

  if (!preflight.ok) {
    const results = notExecutedResults(`preflight abort: ${preflight.abortReason}`);
    const report = renderReport(preflight, results, false);
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, report);
    console.error(preflight.abortReason);
    console.error('NO MUTATIONS EXECUTED');
    console.error('SCANNER E2E: NOT GREEN');
    process.exit(preflight.exitCode);
  }

  const results = await executeScenarios(process.env, preflight.runId!);
  const green = isGreen(results);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, renderReport(preflight, results, green));
  console.error(`SCANNER E2E: ${green ? 'GREEN' : 'NOT GREEN'}`);
  process.exit(green ? 0 : 1);
};

main().catch((err) => {
  console.error('SCANNER E2E FATAL', err);
  process.exit(1);
});
