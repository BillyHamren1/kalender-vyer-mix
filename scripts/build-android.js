#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MODES = {
  time: {
    appId: 'se.eventflow.time',
    appName: 'EventFlow Time',
    androidDir: 'native/time/android',
    buildScript: 'build:time',
    mainActivity: 'app/src/main/java/se/eventflow/time/MainActivity.java',
    signingPrefix: 'EVENTFLOW_TIME',
  },
  scanner: {
    appId: 'se.eventflow.scanner',
    appName: 'EventFlow Scanner',
    androidDir: 'native/scanner/android',
    buildScript: 'build:scanner',
    mainActivity: 'app/src/main/java/se/eventflow/scanner/MainActivity.java',
    signingPrefix: 'EVENTFLOW_SCANNER',
  },
};

const mode = process.argv[2];
const flags = new Set(process.argv.slice(3));
const allowedFlags = new Set([
  '--skip-build',
  '--sync-only',
  '--verify-only',
  '--assemble-debug',
  '--release',
]);

if (!mode || !MODES[mode] || [...flags].some((flag) => !allowedFlags.has(flag))) {
  console.error('Usage: node scripts/build-android.js <time|scanner> [--skip-build|--sync-only|--verify-only|--assemble-debug|--release]');
  process.exit(1);
}

if (flags.has('--assemble-debug') && flags.has('--release')) {
  console.error('Choose either --assemble-debug or --release.');
  process.exit(1);
}

const config = MODES[mode];
const androidDir = resolve(ROOT, config.androidDir);
const appDir = resolve(androidDir, 'app');
const modeEnv = { ...process.env, CAPACITOR_APP_MODE: mode };

function fail(message) {
  console.error(`\nBUILD CONTRACT FAILED: ${message}\n`);
  process.exit(1);
}

function run(executable, args, options = {}) {
  console.log(`  > ${executable} ${args.join(' ')}`);
  execFileSync(executable, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdio: 'inherit',
  });
}

function requireContains(file, expected, label) {
  if (!existsSync(file)) fail(`${label} is missing: ${file}`);
  const content = readFileSync(file, 'utf8');
  if (!content.includes(expected)) {
    fail(`${label} does not contain ${JSON.stringify(expected)}.`);
  }
  return content;
}

function readFileTree(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = resolve(directory, entry);
    if (statSync(fullPath).isDirectory()) files.push(...readFileTree(fullPath));
    else files.push({ path: fullPath, content: readFileSync(fullPath, 'utf8') });
  }
  return files;
}

function verifyNativeProject() {
  const buildGradle = resolve(appDir, 'build.gradle');
  requireContains(buildGradle, `namespace = "${config.appId}"`, 'app/build.gradle');
  requireContains(buildGradle, `applicationId "${config.appId}"`, 'app/build.gradle');
  requireContains(
    resolve(appDir, 'src/main/res/values/strings.xml'),
    `<string name="package_name">${config.appId}</string>`,
    'strings.xml',
  );
  requireContains(resolve(androidDir, config.mainActivity), `package ${config.appId};`, 'MainActivity');

  const configOutput = execFileSync(
    resolve(ROOT, 'node_modules/.bin/cap'),
    ['config', '--json'],
    { cwd: ROOT, env: modeEnv, encoding: 'utf8' },
  );
  const evaluated = JSON.parse(configOutput);
  if (evaluated.app.appId !== config.appId) {
    fail(`Capacitor resolved ${evaluated.app.appId}, expected ${config.appId}.`);
  }
  if (resolve(evaluated.android.platformDirAbs) !== androidDir) {
    fail(`Capacitor resolved Android path ${evaluated.android.platformDirAbs}, expected ${androidDir}.`);
  }

  if (mode === 'time') {
    const javaRoot = resolve(appDir, 'src/main/java');
    const timeSources = existsSync(javaRoot) ? readFileTree(javaRoot) : [];
    const forbidden = timeSources.find(
      (file) => /DataWedge|ZebraRfid/i.test(file.path) || /com\.zebra\.rfid\.api3/.test(file.content),
    );
    if (forbidden) fail(`Time contains scanner-native code: ${forbidden.path}`);
  } else {
    const scannerMain = resolve(androidDir, config.mainActivity);
    requireContains(scannerMain, 'registerPlugin(DataWedgePlugin.class);', 'Scanner MainActivity');
    requireContains(scannerMain, 'registerPlugin(ZebraRfidPlugin.class);', 'Scanner MainActivity');
    requireContains(
      resolve(appDir, 'src/main/java/se/eventflow/scanner/ZebraRfidPlugin.java'),
      'com.zebra.rfid.api3',
      'Zebra RFID plugin',
    );
  }
}

function stageZebraSdk() {
  const source = process.env.ZEBRA_API3_AAR_PATH;
  const expectedHash = process.env.ZEBRA_API3_AAR_SHA256?.toLowerCase();
  if (!source || !expectedHash) {
    fail('Zebra builds require ZEBRA_API3_AAR_PATH and ZEBRA_API3_AAR_SHA256. The licensed SDK is never stored in Git.');
  }
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath) || !sourcePath.toLowerCase().endsWith('.aar')) {
    fail(`ZEBRA_API3_AAR_PATH is not a readable .aar file: ${sourcePath}`);
  }
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    fail('ZEBRA_API3_AAR_SHA256 must be a 64-character SHA-256 digest.');
  }
  const bytes = readFileSync(sourcePath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) {
    fail(`Zebra API3 checksum mismatch: expected ${expectedHash}, got ${actualHash}.`);
  }
  const libsDir = resolve(appDir, 'libs');
  mkdirSync(libsDir, { recursive: true });
  copyFileSync(sourcePath, resolve(libsDir, 'zebra-api3.aar'));
  console.log(`  Zebra API3 verified: ${actualHash}`);
}

function stageTimeGoogleServices() {
  const source = process.env.EVENTFLOW_TIME_GOOGLE_SERVICES_JSON_PATH;
  if (!source) fail('Time release requires EVENTFLOW_TIME_GOOGLE_SERVICES_JSON_PATH.');
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) fail(`Google Services file is missing: ${sourcePath}`);
  copyFileSync(sourcePath, resolve(appDir, 'google-services.json'));
}

function verifyReleaseSecrets() {
  for (const suffix of ['KEYSTORE_PATH', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']) {
    if (!process.env[`${config.signingPrefix}_${suffix}`]) {
      fail(`Release requires ${config.signingPrefix}_${suffix}.`);
    }
  }
  if (!existsSync(resolve(process.env[`${config.signingPrefix}_KEYSTORE_PATH`]))) {
    fail(`${config.signingPrefix}_KEYSTORE_PATH does not exist.`);
  }
}

console.log(`\nEventFlow Android: ${config.appName}`);
console.log(`  App ID: ${config.appId}`);
console.log(`  Native project: ${config.androidDir}`);

verifyNativeProject();
if (mode === 'scanner') stageZebraSdk();
if (flags.has('--release')) {
  verifyReleaseSecrets();
  if (mode === 'time') stageTimeGoogleServices();
}

if (flags.has('--verify-only')) {
  console.log('  Native build contract verified.');
  process.exit(0);
}

if (!flags.has('--skip-build') && !flags.has('--sync-only')) {
  run('npm', ['run', config.buildScript]);
}

run('node', ['scripts/generate-icons.js'], {
  env: { ...modeEnv, APP_MODE: mode, ICON_PLATFORM: 'android' },
});
run(resolve(ROOT, 'node_modules/.bin/cap'), ['sync', 'android'], { env: modeEnv });

if (flags.has('--assemble-debug') || flags.has('--release')) {
  const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const gradleEnv = {
    ...modeEnv,
    GRADLE_USER_HOME: process.env.EVENTFLOW_GRADLE_USER_HOME
      ? resolve(process.env.EVENTFLOW_GRADLE_USER_HOME)
      : resolve(ROOT, '.gradle-eventflow'),
  };
  run(gradle, [flags.has('--release') ? 'bundleRelease' : 'assembleDebug'], {
    cwd: androidDir,
    env: gradleEnv,
  });
}

console.log(`\n${config.appName} Android project is ready at ${config.androidDir}.\n`);
