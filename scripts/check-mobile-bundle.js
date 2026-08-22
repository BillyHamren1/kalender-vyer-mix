import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
if (mode !== 'scanner' && mode !== 'time') {
  throw new Error('Usage: node scripts/check-mobile-bundle.js <scanner|time>');
}

const outputDirectory = path.resolve(`dist-${mode}`);
const auditPath = path.join(outputDirectory, 'bundle-audit.json');
if (!fs.existsSync(auditPath)) {
  throw new Error(`Bundle audit missing: ${auditPath}`);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (audit.mode !== mode || !Array.isArray(audit.chunks)) {
  throw new Error(`Invalid ${mode} bundle audit`);
}

const modules = audit.chunks.flatMap((chunk) => chunk.modules ?? []);
const entryChunks = audit.chunks.filter((chunk) => chunk.isEntry);
const totalJavaScriptBytes = audit.chunks.reduce((sum, chunk) => sum + (chunk.codeBytes ?? 0), 0);

const contracts = {
  scanner: {
    entry: '/src/main-scanner.tsx',
    maxJavaScriptBytes: 1_150_000,
    forbidden: [
      '/src/App.tsx',
      '/src/app/TimeApplication.tsx',
      '/src/shells/TimeAppShell.tsx',
      '/src/pages/mobile/',
      '/src/pages/project/',
      '/src/features/site-scans/',
      '/src/components/layouts/',
      '/src/contexts/MobileAuthContext.tsx',
      '/src/hooks/useGeofencing.ts',
      '/src/hooks/useBackgroundLocationReporter.ts',
      '/src/services/timerSyncQueue.ts',
      '/src/services/pushNotificationService.ts',
      '/node_modules/@capgo/background-geolocation/',
      '/node_modules/@capacitor/local-notifications/',
      '/node_modules/@capacitor/push-notifications/',
      '/node_modules/@capacitor/geolocation/',
    ],
  },
  time: {
    entry: '/src/main-time.tsx',
    maxJavaScriptBytes: 3_150_000,
    forbidden: [
      '/src/App.tsx',
      '/src/app/ScannerApplication.tsx',
      '/src/shells/ScannerAppShell.tsx',
      '/src/pages/MobileScannerApp.tsx',
      '/src/pages/scanner/',
      '/src/components/scanner/',
      '/src/hooks/scanner/',
      '/src/lib/scanner/',
      '/src/services/scanner',
    ],
  },
};

const contract = contracts[mode];
const failures = [];
if (entryChunks.length !== 1) failures.push(`expected exactly one entry chunk, found ${entryChunks.length}`);
if (!modules.some((moduleId) => moduleId.endsWith(contract.entry))) {
  failures.push(`entry module ${contract.entry} is missing`);
}

for (const forbidden of contract.forbidden) {
  const matches = modules.filter((moduleId) => moduleId.includes(forbidden));
  if (matches.length > 0) failures.push(`forbidden module family ${forbidden}: ${matches.slice(0, 3).join(', ')}`);
}

if (totalJavaScriptBytes > contract.maxJavaScriptBytes) {
  failures.push(`JavaScript budget exceeded: ${totalJavaScriptBytes} > ${contract.maxJavaScriptBytes} bytes`);
}

if (failures.length > 0) {
  console.error(`[bundle:${mode}] FAIL`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[bundle:${mode}] PASS — ${modules.length} modules, ${audit.chunks.length} chunks, ${totalJavaScriptBytes} JS bytes`);
