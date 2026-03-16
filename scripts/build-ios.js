#!/usr/bin/env node

/**
 * iOS Build Script for EventFlow dual-app architecture
 * 
 * Usage:
 *   node scripts/build-ios.js time        — Full build EventFlow Time for iOS
 *   node scripts/build-ios.js scanner     — Full build EventFlow Scanner for iOS
 *   node scripts/build-ios.js time --sync-only  — Only sync (skip frontend build)
 * 
 * This script:
 *   1. Copies the correct capacitor.[mode].config.ts → capacitor.config.ts
 *   2. Builds the frontend with VITE_APP_MODE=[mode]
 *   3. Generates correct iOS app icons from the mode-specific source
 *   4. Runs npx cap sync ios
 */

import { execSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config per mode ────────────────────────────────────────────
const MODES = {
  time: {
    appId: 'se.eventflow.time',
    appName: 'EventFlow Time',
    configFile: 'capacitor.time.config.ts',
  },
  scanner: {
    appId: 'se.eventflow.scanner',
    appName: 'EventFlow Scanner',
    configFile: 'capacitor.scanner.config.ts',
  },
};

// ── Parse args ─────────────────────────────────────────────────
const mode = process.argv[2];
const syncOnly = process.argv.includes('--sync-only');
const skipBuild = process.argv.includes('--skip-build');

if (!mode || !MODES[mode]) {
  console.error('❌ Usage: node scripts/build-ios.js <time|scanner> [--skip-build] [--sync-only]');
  console.error('');
  console.error('  --skip-build   Skip frontend build (use existing dist/)');
  console.error('  --sync-only    Only generate icons + sync (no frontend build)');
  process.exit(1);
}

const cfg = MODES[mode];

function run(cmd, label) {
  console.log(`\n▶ ${label || cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  console.log(`\n🍎 EventFlow iOS Build — ${cfg.appName}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   App ID: ${cfg.appId}\n`);

  // 1. Copy mode-specific Capacitor config
  const srcConfig = resolve(ROOT, cfg.configFile);
  const destConfig = resolve(ROOT, 'capacitor.config.ts');
  if (!existsSync(srcConfig)) {
    console.error(`❌ Config file not found: ${cfg.configFile}`);
    process.exit(1);
  }
  copyFileSync(srcConfig, destConfig);
  console.log(`✅ Copied ${cfg.configFile} → capacitor.config.ts`);

  // 2. Build frontend (unless skipped)
  if (!syncOnly && !skipBuild) {
    run(`VITE_APP_MODE=${mode} npm run build`, `Building frontend (VITE_APP_MODE=${mode})`);
  } else {
    console.log('⏭️  Skipping frontend build');
  }

  // 3. Generate iOS icons from correct source
  const iconSource = resolve(ROOT, 'assets', 'app-icons', `eventflow-${mode}-icon.png`);
  if (!existsSync(iconSource)) {
    console.error(`❌ Icon source not found: ${iconSource}`);
    console.error(`   Expected: assets/app-icons/eventflow-${mode}-icon.png`);
    process.exit(1);
  }
  run(`APP_MODE=${mode} node scripts/generate-icons.js`, `Generating icons for ${cfg.appName}`);

  // 4. Sync iOS
  run('npx cap sync ios', 'Syncing iOS project');

  console.log(`\n✨ iOS build complete for ${cfg.appName}!`);
  console.log(`   Open Xcode: npx cap open ios`);
  console.log(`   The AppIcon set has been generated from: assets/app-icons/eventflow-${mode}-icon.png\n`);
}

main().catch((err) => {
  console.error('❌ iOS build failed:', err);
  process.exit(1);
});
