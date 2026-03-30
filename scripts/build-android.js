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
    buildScript: 'build:time',
  },
  scanner: {
    appId: 'se.eventflow.scanner',
    appName: 'EventFlow Scanner',
    configFile: 'capacitor.scanner.config.ts',
    buildScript: 'build:scanner',
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

// ── Step 1b: Generate icons for correct mode ──────────────────
console.log('\n1️⃣b Generating icons...');
try {
  run(`APP_MODE=${mode} node scripts/generate-icons.js`);
  console.log('  ✅ Icons generated for ' + mode);
} catch (e) {
  console.warn('  ⚠ Icon generation failed (sharp not installed?). Continuing...');
}

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

// ── Step 4: Patch app/build.gradle ─────────────────────────────
console.log('\n4️⃣  Patching app/build.gradle...');
const buildGradle = resolve(androidDir, 'app', 'build.gradle');
patchFile(buildGradle, [
  [/namespace\s+"se\.eventflow\.\w+"/, `namespace "${config.appId}"`],
  [/applicationId\s+"se\.eventflow\.\w+"/, `applicationId "${config.appId}"`],
]);
console.log(`  ✅ applicationId & namespace → ${config.appId}`);

// ── Step 4b: Inject Firebase / Google Services into Gradle (TIME only) ─
if (mode === 'time') {
  console.log('\n4️⃣b Injecting Firebase Cloud Messaging into Gradle...');

  // Patch root build.gradle — add google-services classpath
  const rootBuildGradle = resolve(androidDir, 'build.gradle');
  if (existsSync(rootBuildGradle)) {
    let rootContent = readFileSync(rootBuildGradle, 'utf-8');
    if (!rootContent.includes('google-services')) {
      // Add google-services classpath to buildscript dependencies
      rootContent = rootContent.replace(
        /buildscript\s*\{[^}]*repositories\s*\{[^}]*\}[^}]*dependencies\s*\{/s,
        (match) => match + `\n        classpath 'com.google.gms:google-services:4.4.2'`
      );
      // If buildscript block doesn't exist (newer Gradle), add the plugin to plugins block
      if (!rootContent.includes('google-services')) {
        rootContent = rootContent.replace(
          /(plugins\s*\{)/,
          `$1\n    id 'com.google.gms.google-services' version '4.4.2' apply false`
        );
      }
      writeFileSync(rootBuildGradle, rootContent, 'utf-8');
      console.log('  ✅ google-services plugin added to root build.gradle');
    } else {
      console.log('  ℹ️  google-services already in root build.gradle');
    }
  } else {
    console.warn('  ⚠ Root build.gradle not found — will be created after cap add android');
  }

  // Patch app/build.gradle — apply google-services plugin + firebase-messaging dependency
  if (existsSync(buildGradle)) {
    let appContent = readFileSync(buildGradle, 'utf-8');
    let changed = false;

    // Add apply plugin at the end of the file (required for google-services)
    if (!appContent.includes('com.google.gms.google-services')) {
      appContent += `\napply plugin: 'com.google.gms.google-services'\n`;
      changed = true;
    }

    // Add firebase-messaging dependency
    if (!appContent.includes('firebase-messaging')) {
      appContent = appContent.replace(
        /(dependencies\s*\{)/,
        `$1\n    implementation platform('com.google.firebase:firebase-bom:33.7.0')\n    implementation 'com.google.firebase:firebase-messaging'`
      );
      changed = true;
    }

    if (changed) {
      writeFileSync(buildGradle, appContent, 'utf-8');
      console.log('  ✅ Firebase Messaging + google-services plugin added to app/build.gradle');
    } else {
      console.log('  ℹ️  Firebase already configured in app/build.gradle');
    }
  } else {
    console.warn('  ⚠ app/build.gradle not found — run cap add android first');
  }
} else {
  console.log('\n4️⃣b Skipping Firebase injection (not needed for scanner)');
}

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
║  Firebase / FCM:
║    Ensure google-services.json is placed at:
║    android/app/google-services.json
║    (Firebase project must use package: ${config.appId})
║  
║  Next steps:
║    npx cap open android
║    — or —
║    npx cap run android
╚═══════════════════════════════════════════════╝
`);
