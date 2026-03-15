#!/usr/bin/env node

/**
 * Android Build Script for EventFlow dual-app architecture
 * 
 * Usage:
 *   node scripts/build-android.js time    — Build EventFlow Time
 *   node scripts/build-android.js scanner — Build EventFlow Scanner
 * 
 * This script:
 *   1. Copies the correct capacitor.[mode].config.ts → capacitor.config.ts
 *   2. Builds the frontend with VITE_APP_MODE=[mode]
 *   3. Patches Android strings.xml with correct app name & package
 *   4. Patches Android build.gradle with correct applicationId & namespace
 *   5. Runs npx cap sync android
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
const skipBuild = process.argv.includes('--skip-build');
const syncOnly = process.argv.includes('--sync-only');

if (!mode || !MODES[mode]) {
  console.error('❌ Usage: node scripts/build-android.js <time|scanner> [--skip-build] [--sync-only]');
  console.error('');
  console.error('  --skip-build   Skip frontend build (use existing dist/)');
  console.error('  --sync-only    Only patch Android files + sync (no frontend build)');
  process.exit(1);
}

const config = MODES[mode];

function run(cmd, opts = {}) {
  console.log(`  ▸ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function patchFile(filePath, replacements) {
  if (!existsSync(filePath)) {
    console.warn(`  ⚠ File not found, skipping: ${filePath}`);
    return false;
  }
  let content = readFileSync(filePath, 'utf-8');
  for (const [search, replace] of replacements) {
    content = content.replace(search, replace);
  }
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

// ── Step 1: Copy Capacitor config ──────────────────────────────
console.log(`\n🔧 Building Android: ${config.appName} (${config.appId})\n`);

console.log('1️⃣  Copying Capacitor config...');
const srcConfig = resolve(ROOT, config.configFile);
const dstConfig = resolve(ROOT, 'capacitor.config.ts');
if (!existsSync(srcConfig)) {
  console.error(`❌ Config file not found: ${config.configFile}`);
  process.exit(1);
}
writeFileSync(dstConfig, readFileSync(srcConfig, 'utf-8'));
console.log(`  ✅ ${config.configFile} → capacitor.config.ts`);

// ── Step 2: Build frontend ─────────────────────────────────────
if (!skipBuild && !syncOnly) {
  console.log('\n2️⃣  Building frontend...');
  run(`VITE_APP_MODE=${mode} npm run build`);
  console.log('  ✅ Frontend built');
} else {
  console.log('\n2️⃣  Skipping frontend build');
}

// ── Step 3: Ensure Android project exists ──────────────────────
const androidDir = resolve(ROOT, 'android');
if (!existsSync(resolve(androidDir, 'app', 'build.gradle'))) {
  console.log('\n3️⃣  Android project not found — running cap add android...');
  run('npx cap add android');
} else {
  console.log('\n3️⃣  Android project exists');
}

// ── Step 4: Patch build.gradle ─────────────────────────────────
console.log('\n4️⃣  Patching build.gradle...');
const buildGradle = resolve(androidDir, 'app', 'build.gradle');
patchFile(buildGradle, [
  [/namespace\s+"se\.eventflow\.\w+"/, `namespace "${config.appId}"`],
  [/applicationId\s+"se\.eventflow\.\w+"/, `applicationId "${config.appId}"`],
]);
console.log(`  ✅ applicationId & namespace → ${config.appId}`);

// ── Step 5: Patch or create strings.xml ────────────────────────
console.log('\n5️⃣  Patching strings.xml...');
const stringsPath = resolve(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
const stringsDir = dirname(stringsPath);
if (!existsSync(stringsDir)) {
  mkdirSync(stringsDir, { recursive: true });
}
const stringsContent = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${config.appName}</string>
    <string name="title_activity_main">${config.appName}</string>
    <string name="package_name">${config.appId}</string>
    <string name="custom_url_scheme">${config.appId}</string>
</resources>
`;
writeFileSync(stringsPath, stringsContent, 'utf-8');
console.log(`  ✅ app_name → ${config.appName}`);

// ── Step 6: Patch AndroidManifest.xml ──────────────────────────
console.log('\n6️⃣  Patching AndroidManifest.xml...');
const manifestPath = resolve(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
patchFile(manifestPath, [
  [/package="se\.eventflow\.\w+"/, `package="${config.appId}"`],
]);
console.log(`  ✅ package → ${config.appId}`);

// ── Step 7: Sync ───────────────────────────────────────────────
console.log('\n7️⃣  Syncing Capacitor...');
run('npx cap sync android');
console.log('  ✅ Sync complete');

// ── Done ───────────────────────────────────────────────────────
console.log(`
╔═══════════════════════════════════════════════╗
║  ✅  ${config.appName} Android build ready!
║  
║  App ID:   ${config.appId}
║  Mode:     ${mode}
║  
║  Next steps:
║    npx cap open android
║    — or —
║    npx cap run android
╚═══════════════════════════════════════════════╝
`);
