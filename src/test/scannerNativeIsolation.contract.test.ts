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
    expect(read('capacitor.scanner.config.ts')).toContain('includePlugins: []');
    expect(read('capacitor.scanner.config.ts')).toContain('allowMixedContent: false');
    expect(read('capacitor.scanner.config.ts')).not.toContain('ios: {');

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

  it('keeps Scanner backup, TLS trust and DataWedge diagnostics fail-closed', () => {
    const manifest = read('native/scanner/android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:fullBackupContent="false"');

    const networkSecurity = read('native/scanner/android/app/src/main/res/xml/network_security_config.xml');
    expect(networkSecurity).toContain('cleartextTrafficPermitted="false"');
    expect(networkSecurity).toContain('<certificates src="system" />');
    expect(networkSecurity).not.toContain('<certificates src="user" />');

    const plugin = read('native/scanner/android/app/src/main/java/se/eventflow/scanner/DataWedgePlugin.java');
    expect(plugin).not.toMatch(/barcode=" \+ barcode|barcode: " \+ barcode|dumpExtras\(/);
    expect(plugin).not.toContain('payload.put("rawExtras"');

    const activity = read('native/scanner/android/app/src/main/java/se/eventflow/scanner/MainActivity.java');
    expect(activity).not.toContain('diagnosticScanReceiver');
    expect(activity).not.toContain('SCAN EXTRA');
    expect(activity).toContain('"https".equalsIgnoreCase(origin.getScheme())');
    expect(activity).toContain('"localhost".equalsIgnoreCase(origin.getHost())');
    expect(activity).toContain('PermissionRequest.RESOURCE_VIDEO_CAPTURE');
    expect(activity).toContain('request.deny()');

    const rfidPlugin = read('native/scanner/android/app/src/main/java/se/eventflow/scanner/ZebraRfidPlugin.java');
    expect(rfidPlugin).not.toContain('"Tag event sent: " + epc');

    const bridge = read('src/services/scanner/DataWedgeBridge.ts');
    expect(bridge).not.toContain("Native scan received:', payload.data");
    expect(bridge).not.toContain('entry.rawExtras = payload.rawExtras');
    expect(bridge).not.toContain('return initCommandResults.get(commandName)');

    const setup = read('docs/zebra-datawedge-setup.md');
    expect(setup).toContain('Component Information');
    expect(setup).toContain('signaturkontroll `ON`');
    expect(setup).toContain('Intent API-kategorier dessutom sättas till **Controlled**');
  });

  it('syncs no unrelated native Capacitor plugins into Scanner', () => {
    const settings = read('native/scanner/android/capacitor.settings.gradle');
    const appGradle = read('native/scanner/android/app/capacitor.build.gradle');
    expect(settings).not.toMatch(/background|geolocation|notification|camera|browser/i);
    expect(appGradle).not.toMatch(/background|geolocation|notification|camera|browser/i);

    const scannerAuth = read('src/contexts/ScannerAuthContext.tsx');
    expect(scannerAuth).not.toContain('@/hooks/');
    expect(scannerAuth).not.toMatch(/services\/(timer|push|location)/i);
    expect(scannerAuth).not.toContain('viewAsStorage');
    expect(read('src/shells/ScannerAppShell.tsx')).toContain('ScannerAuthProvider');
    expect(read('src/shells/ScannerAppShell.tsx')).not.toContain('MobileAuthProvider');
  });
});
