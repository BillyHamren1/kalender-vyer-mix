import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('mobile bundle isolation contract', () => {
  it('selects dedicated Scanner and Time entries before the module graph is resolved', () => {
    const config = read('vite.config.ts');

    expect(config).toContain("find: '/src/main.tsx'");
    expect(config).toContain('`./src/main-${mobileMode}.tsx`');
    expect(read('src/main-scanner.tsx')).toContain("import('@/app/ScannerApplication')");
    expect(read('src/main-time.tsx')).toContain("import('@/app/TimeApplication')");
    expect(read('src/main-scanner.tsx')).not.toContain("import('./App')");
    expect(read('src/main-time.tsx')).not.toContain("import('./App')");
  });

  it('keeps the Time code reader free from warehouse Scanner imports and mutations', () => {
    const shell = read('src/shells/TimeAppShell.tsx');
    const capture = read('src/pages/mobile/MobileCodeCapture.tsx');

    expect(shell).toContain("import MobileCodeCapture from '@/pages/mobile/MobileCodeCapture'");
    expect(shell).not.toContain("import MobileScannerApp from '@/pages/MobileScannerApp'");
    expect(capture).not.toMatch(/scannerService|scanner-operation|useScanner|DataWedge|RFID|Zebra/);
    expect(capture).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.invoke\(/);
  });

  it('makes both production build commands enforce the generated audit', () => {
    const packageJson = JSON.parse(read('package.json'));
    const gate = read('scripts/check-mobile-bundle.js');

    expect(packageJson.scripts['build:scanner']).toContain('check-mobile-bundle.js scanner');
    expect(packageJson.scripts['build:time']).toContain('check-mobile-bundle.js time');
    expect(gate).toContain("'/src/App.tsx'");
    expect(gate).toContain("'/src/pages/MobileScannerApp.tsx'");
    expect(gate).toContain('maxJavaScriptBytes');
  });

  it('removes preview-only remote code from native HTML builds', () => {
    const config = read('vite.config.ts');

    expect(config).toContain('cdn\\.gpteng\\.co');
    expect(config).toContain("replace('/src/main.tsx', `/src/main-${mobileMode}.tsx`)");
  });
});
