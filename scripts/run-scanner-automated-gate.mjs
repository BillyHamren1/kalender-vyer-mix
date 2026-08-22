#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsOnly = process.argv.includes('--scanner-tests-only');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--scanner-tests-only');
if (unknownArgs.length > 0) {
  console.error('Usage: node scripts/run-scanner-automated-gate.mjs [--scanner-tests-only]');
  process.exit(64);
}

const scannerTestNames = readdirSync(resolve(ROOT, 'src/test'))
  .filter((name) => /^(scanner|scanConfirmation|warehouseWorkerManagerSeparation|wmsPlanningReconciliation).+\.test\.tsx?$/.test(name))
  .sort()
  .map((name) => `src/test/${name}`);

const scannerTests = [
  'src/services/__tests__/scannerService.scanning.test.ts',
  'src/__tests__/scanner-wms-flow.static.test.ts',
  ...scannerTestNames,
];

const gates = [
  {
    name: 'Scanner V2, queue, readiness, native, bundle and release contracts',
    command: resolve(ROOT, 'node_modules/.bin/vitest'),
    args: ['run', ...scannerTests],
  },
  ...(!testsOnly ? [
    {
      name: 'Scanner readiness and exact reservation line (Deno)',
      command: resolve(ROOT, 'node_modules/.bin/deno'),
      args: ['test', '--allow-env', '--allow-read', 'supabase/functions/_shared/scanner-readiness.test.ts'],
    },
    {
      name: 'Scanner shared Edge modules (Deno check)',
      command: resolve(ROOT, 'node_modules/.bin/deno'),
      args: ['check', 'supabase/functions/_shared/reservation-line-identity.ts', 'supabase/functions/_shared/scanner-readiness.ts'],
    },
    {
      name: 'TypeScript',
      command: resolve(ROOT, 'node_modules/.bin/tsc'),
      args: ['--noEmit'],
    },
    {
      name: 'Time frontend quality gate',
      command: 'bash',
      args: ['scripts/test-time-reporting.sh', '--frontend-only'],
    },
    {
      name: 'Time pure backend timeline tests',
      command: resolve(ROOT, 'node_modules/.bin/deno'),
      args: ['test', '--allow-env', '--allow-read', 'supabase/functions/day-timeline-engine/engine.test.ts'],
    },
    {
      name: 'Scanner isolated web build',
      command: resolve(ROOT, 'node_modules/.bin/vite'),
      args: ['build', '--mode', 'scanner', '--outDir', 'dist-scanner'],
    },
    {
      name: 'Scanner bundle audit',
      command: 'node',
      args: ['scripts/check-mobile-bundle.js', 'scanner'],
    },
    {
      name: 'Time isolated web build',
      command: resolve(ROOT, 'node_modules/.bin/vite'),
      args: ['build', '--mode', 'time', '--outDir', 'dist-time'],
    },
    {
      name: 'Time bundle audit',
      command: 'node',
      args: ['scripts/check-mobile-bundle.js', 'time'],
    },
    {
      name: 'Time native project contract',
      command: 'node',
      args: ['scripts/build-android.js', 'time', '--verify-only'],
    },
  ] : []),
];

const results = [];
for (const gate of gates) {
  console.log(`\n=== ${gate.name} ===`);
  const startedAt = Date.now();
  const result = spawnSync(gate.command, gate.args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });
  const status = result.error ? 127 : (result.status ?? 1);
  if (result.error) console.error(`Could not start gate: ${result.error.message}`);
  results.push({ name: gate.name, status, durationMs: Date.now() - startedAt, error: result.error?.message ?? null });
  if (status !== 0) break;
}

console.log('\n=== Automated gate summary ===');
for (const result of results) {
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'}  ${result.name} (${(result.durationMs / 1000).toFixed(1)}s)${result.error ? ` – ${result.error}` : ''}`);
}

const failed = results.find((result) => result.status !== 0);
if (failed) {
  console.error(`\nAUTOMATED SCANNER GATE: FAIL (${failed.name})`);
  process.exit(failed.status || 1);
}

if (!testsOnly) {
  console.log('\nExternal release gates (never counted as PASS here):');
  console.log('BLOCKED  Approved LOCAL/TEST WMS + Supabase E2E environment');
  console.log('BLOCKED  Licensed Zebra API3 AAR + Gradle scanner compile');
  console.log('BLOCKED  Physical Zebra DataWedge/RFID verification');
  console.log('BLOCKED  Release signing and signed APK/AAB verification');
  console.log('BLOCKED  Full scanner Edge graph until its remote Supabase import is available');
  console.log('\nAUTOMATED SCANNER GATE: PASS');
  console.log('OVERALL SCANNER RELEASE: BLOCKED (external gates remain)');
}
