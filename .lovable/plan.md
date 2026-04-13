

## iOS Scanner Camera Fix

### Root Cause
In `QRScanner.tsx` line 32:
```ts
const shouldSkipCamera = skipCamera ?? isScannerApp;
```
`isScannerApp` is `true` for **all** scanner builds (Android AND iOS). This incorrectly skips the camera on iOS, where there is no Zebra/DataWedge hardware — the camera is the primary scanning method.

### Changes Required

**File 1: `src/components/scanner/QRScanner.tsx`**
- Line 32: Replace `const shouldSkipCamera = skipCamera ?? isScannerApp;` with:
```ts
// Skip camera only on Android scanner builds (Zebra/DataWedge handles scanning).
// iOS scanner builds and web must use the camera.
const isNativeAndroidScanner = isScannerApp && Capacitor.getPlatform() === 'android';
const shouldSkipCamera = skipCamera ?? isNativeAndroidScanner;
```
- Update the JSDoc comment (lines 19-29) to reflect the new logic.
- No other changes needed — `Capacitor` is already imported on line 5.

**File 2: `ios/App/App/Info.plist`**
- Update three permission strings from "EventFlow Time" to "EventFlow Scanner" with scanner-relevant descriptions. The `capacitor.scanner.config.ts` already has correct `infoPlist` overrides, but the base Info.plist should also reflect the scanner app since it's the starting point for `cap sync`.

**No changes needed in:**
- `MobileScannerApp.tsx` — uses `<QRScanner>` without `skipCamera`, so it inherits the corrected default.
- `VerificationView.tsx` — same, uses `<QRScanner>` at lines 397 and 574 without `skipCamera`. After the fix, iOS will show camera, Android will still skip it.
- `capacitor.scanner.config.ts` — already has correct iOS permission strings.

### Behavior After Fix

| Environment | `isScannerApp` | `Capacitor.getPlatform()` | `shouldSkipCamera` | Result |
|---|---|---|---|---|
| Android scanner (Zebra) | true | 'android' | true | Camera skipped, DataWedge used |
| iOS scanner (iPhone) | true | 'ios' | false | Camera opens |
| Web browser | false | 'web' | false | Camera opens |
| Explicit `skipCamera={true}` | any | any | true | Camera skipped |

### Known WKWebView limitation
`navigator.permissions.query({ name: 'camera' })` can hang in WKWebView — this is already handled in the existing code (line 174-175: skips permission query on iOS native). No changes needed there.

