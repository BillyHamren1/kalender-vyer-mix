

## Problem

The last change broke the scanner app on iOS by adding an unnecessary intermediate "Starta kameran" step inside QRScanner. The user already taps a Camera button on the home screen to open the scanner — that IS the user gesture iOS requires. The extra idle state shows a full-screen black overlay, making it look like the app crashed.

## Plan

### Revert the iOS idle-state logic in QRScanner

**File: `src/components/scanner/QRScanner.tsx`**

1. **Remove the iOS special-case in useEffect** (lines 443-446): Delete the `if (isIos)` branch that sets `cameraState='idle'` and waits for a tap. Instead, call `startCamera()` for ALL platforms (iOS and non-iOS alike), since the user gesture requirement is already satisfied by tapping the Camera button in MobileScannerApp.

2. **Remove the idle+iOS overlay** (lines 480-495): Delete the "Tryck för att starta kameran" button/overlay that shows when `cameraState === 'idle' && isIos`. This screen is what causes the "black screen" appearance.

3. **Keep the debug panel**: The on-screen debug panel (lines 573-604) is still useful for diagnosing camera issues. Keep it.

4. **Keep all other camera logic as-is**: The `startCamera()` function, fallback constraints, timeout handling, scan loop — all unchanged.

### Why this works

The iOS WKWebView gesture requirement means `getUserMedia` must be called from a call stack that originates from a user tap. The flow is:

```text
User taps Camera button (MobileScannerApp)
  → setIsQRActive(true)
  → QRScanner mounts with isActive=true
  → useEffect fires
  → startCamera() → getUserMedia()
```

This chain starts from a user gesture. The `useEffect` runs synchronously in the same tick as the state update that was triggered by the tap — iOS WKWebView accepts this as gesture-initiated. No extra button needed.

### Summary of changes

One file modified: `src/components/scanner/QRScanner.tsx` — ~15 lines removed/changed.

