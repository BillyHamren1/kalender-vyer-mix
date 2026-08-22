import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function filesBelow(path: string): string[] {
  const absolute = resolve(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = resolve(absolute, entry);
    return statSync(child).isDirectory()
      ? filesBelow(`${path}/${entry}`)
      : [`${path}/${entry}`];
  });
}

describe('Time and Zebra native isolation', () => {
  it('resolves immutable app-specific Capacitor paths and web outputs', () => {
    expect(read('capacitor.time.config.ts')).toContain("webDir: 'dist-time'");
    expect(read('capacitor.time.config.ts')).toContain("path: 'native/time/android'");
    expect(read('capacitor.scanner.config.ts')).toContain("webDir: 'dist-scanner'");
    expect(read('capacitor.scanner.config.ts')).toContain("path: 'native/scanner/android'");

    const dispatcher = read('capacitor.config.ts');
    expect(dispatcher).toContain("process.env.CAPACITOR_APP_MODE ?? 'time'");
    expect(dispatcher).not.toMatch(/copyFile|writeFile|android\/app/);
  });

  it('has two fixed Android projects and no shared mutable android root', () => {
    expect(existsSync(resolve(root, 'android'))).toBe(false);
    expect(read('native/time/android/app/build.gradle')).toContain('applicationId "se.eventflow.time"');
    expect(read('native/scanner/android/app/build.gradle')).toContain('applicationId "se.eventflow.scanner"');
    expect(read('native/time/android/capacitor.settings.gradle')).toContain("new File('../../../node_modules/");
    expect(read('native/scanner/android/capacitor.settings.gradle')).toContain("new File('../../../node_modules/");
  });

  it('keeps DataWedge, RFID and API3 entirely outside Time native', () => {
    const timeFiles = filesBelow('native/time/android/app/src/main/java');
    const timeSource = timeFiles.map(read).join('\n');
    expect(timeFiles.join('\n')).not.toMatch(/DataWedge|ZebraRfid/i);
    expect(timeSource).not.toContain('com.zebra.rfid.api3');

    const scannerMain = read('native/scanner/android/app/src/main/java/se/eventflow/scanner/MainActivity.java');
    expect(scannerMain).toContain('registerPlugin(DataWedgePlugin.class);');
    expect(scannerMain).toContain('registerPlugin(ZebraRfidPlugin.class);');
    expect(read('native/scanner/android/app/src/main/java/se/eventflow/scanner/ZebraRfidPlugin.java'))
      .toContain('com.zebra.rfid.api3');
  });

  it('uses separate icons, signing namespaces and release commands', () => {
    const icons = read('scripts/generate-icons.js');
    expect(icons).toContain("path.join(ROOT, 'native', 'time', 'android')");
    expect(icons).toContain("path.join(ROOT, 'native', 'scanner', 'android')");
    expect(icons).toContain("process.env.ICON_PLATFORM || 'all'");
    expect(read('scripts/build-android.js')).toContain("ICON_PLATFORM: 'android'");

    const timeGradle = read('native/time/android/app/build.gradle');
    const scannerGradle = read('native/scanner/android/app/build.gradle');
    expect(timeGradle).toContain('EVENTFLOW_TIME_KEYSTORE_PATH');
    expect(timeGradle).toContain("Time release requires app/google-services.json");
    expect(scannerGradle).toContain('EVENTFLOW_SCANNER_KEYSTORE_PATH');
    expect(scannerGradle).not.toContain('com.google.gms.google-services');
    expect(read('native/time/android/build.gradle')).toContain('com.google.gms:google-services');

    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['android:time:release']).toContain('time --release');
    expect(pkg.scripts['android:scanner:release']).toContain('scanner --release');
    expect(pkg.scripts['ios:scanner']).toBeUndefined();
  });

  it('fails Scanner before sync when the licensed checksum-bound AAR is absent', () => {
    const result = spawnSync('node', ['scripts/build-android.js', 'scanner', '--verify-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ZEBRA_API3_AAR_PATH: '',
        ZEBRA_API3_AAR_SHA256: '',
      },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('ZEBRA_API3_AAR_PATH and ZEBRA_API3_AAR_SHA256');

    const build = read('scripts/build-android.js');
    expect(build).toContain("createHash('sha256')");
    expect(build).toContain("copyFileSync(sourcePath, resolve(libsDir, 'zebra-api3.aar'))");
    expect(read('native/scanner/android/app/build.gradle')).toContain("implementation files('libs/zebra-api3.aar')");
  });

  it('verifies Time without a Zebra SDK and never rewrites config/package identity', () => {
    const result = spawnSync('node', ['scripts/build-android.js', 'time', '--verify-only'], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native build contract verified');

    const build = read('scripts/build-android.js');
    expect(build).not.toMatch(/patchFile|namespace\s*\\s\+|applicationId\s*\\s\+/);
    expect(build).not.toContain("writeFileSync(dstConfig");
  });
});
