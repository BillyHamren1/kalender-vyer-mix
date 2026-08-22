#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const syncOnly = process.argv.includes('--sync-only');
const skipBuild = process.argv.includes('--skip-build');

if (mode !== 'time') {
  console.error('EventFlow Zebra Scanner is Android-only. Usage: node scripts/build-ios.js time [--skip-build|--sync-only]');
  process.exit(1);
}

const modeEnv = {
  ...process.env,
  APP_MODE: 'time',
  CAPACITOR_APP_MODE: 'time',
  ICON_PLATFORM: 'ios',
};

function run(executable, args, label) {
  console.log(`\n> ${label ?? `${executable} ${args.join(' ')}`}`);
  execFileSync(executable, args, { cwd: ROOT, env: modeEnv, stdio: 'inherit' });
}

if (!existsSync(resolve(ROOT, 'ios', 'App', 'App.xcodeproj'))) {
  console.error('Time iOS project is missing at ios/App/App.xcodeproj.');
  process.exit(1);
}

if (!syncOnly && !skipBuild) run('npm', ['run', 'build:time'], 'Build Time frontend');
run('node', ['scripts/generate-icons.js'], 'Generate Time icons');
run(resolve(ROOT, 'node_modules/.bin/cap'), ['sync', 'ios'], 'Sync Time iOS project');

console.log('\nEventFlow Time iOS project is ready at ios/.\n');
