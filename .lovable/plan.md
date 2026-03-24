

# Scanner Camera Access -- Root Cause Analysis and Fix Plan

## Identified Problems

### Problem 1: Android -- Missing CAMERA permission in AndroidManifest.xml
The `AndroidManifest.xml` only declares `INTERNET` permission. There is **no `android.permission.CAMERA`** permission declared. Without this, `getUserMedia()` will always fail on Android because the WebView cannot access the camera hardware.

### Problem 2: Android -- Missing runtime permission request
Capacitor's `@capacitor/camera` plugin is installed and linked in Gradle, but the Android `BridgeActivity` does not automatically grant `getUserMedia()` access in the WebView. On Android 6+, the WebView needs to handle `onPermissionRequest()` to allow the web page to use the camera. By default, Capacitor's `BridgeActivity` handles this, but **only if the manifest permission is declared**.

### Problem 3: Video element missing `autoplay` attribute
The `<video>` element in `QRScanner.tsx` (line 294) has `playsInline` and `muted` but lacks `autoplay`. On iOS WKWebView, this can cause `play()` to silently fail or hang, especially in combination with the Capacitor WebView's media playback policies.

### Problem 4: Potential iOS WKWebView camera access issue
The `CAPBridgeViewController` (used in Main.storyboard) should handle camera access, but the current flow requests permission via `@capacitor/camera` (which is designed for taking photos, not for `getUserMedia`). The `requestPermissions` call may not actually grant the WebView permission to use `getUserMedia()` -- these are separate permission paths on iOS.

### Problem 5: `startCamera` has circular dependency
`startCamera` depends on `scanFrame` (via `useCallback` deps), and `scanFrame` depends on `isActive` and `handleDetected`. Every time `isActive` changes, both callbacks recreate, potentially causing the `useEffect` on line 242 to re-trigger and restart the camera unnecessarily.

---

## Implementation Plan

### Step 1: Add Android CAMERA permission
In `android/app/src/main/AndroidManifest.xml`, add:
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

### Step 2: Add WebView permission handler in Android MainActivity
Override `onPermissionRequest` in `MainActivity.java` to auto-grant camera access to the WebView when the manifest permission is present. This is required because the default Android WebView denies all `getUserMedia` requests unless explicitly granted:
```java
import android.webkit.PermissionRequest;
// In the Bridge, override the WebChromeClient permission handler
```
Actually, Capacitor's BridgeActivity already handles this via its WebChromeClient. The missing manifest permission is the primary blocker. But we should verify and add a manual override if needed.

### Step 3: Fix QRScanner.tsx video element and permission flow
- Add `autoplay` attribute to the video element
- Remove the `@capacitor/camera` permission request (it's for photo capture, not getUserMedia) and instead use a direct `navigator.permissions.query({ name: 'camera' })` check where available
- Stabilize the useCallback dependency chain to prevent camera restart loops
- Add a retry mechanism that doesn't require full component remount

### Step 4: Add iOS-specific WKWebView camera configuration
In `capacitor.config.ts` and `capacitor.scanner.config.ts`, add the `server` config to allow inline media playback:
```typescript
ios: {
  // existing config...
  allowsLinkPreview: false,
}
```
Also, Capacitor 5+ already enables `allowsInlineMediaPlayback` by default, but we should ensure the permission descriptions in Info.plist are correct for both apps.

---

## Files to modify

1. **`android/app/src/main/AndroidManifest.xml`** -- Add `CAMERA` permission
2. **`android/app/src/main/java/se/eventflow/scanner/MainActivity.java`** -- Add WebChromeClient `onPermissionRequest` override to grant camera access to WebView
3. **`src/components/scanner/QRScanner.tsx`** -- Fix video `autoplay`, fix permission flow (don't use `@capacitor/camera` for getUserMedia permissions), stabilize callback deps, improve error recovery
4. **`capacitor.config.ts`** and **`capacitor.scanner.config.ts`** -- Ensure proper iOS media playback settings

## Technical details

The core issue is a mismatch between native permissions and web API permissions:
- `@capacitor/camera` manages permissions for the **native camera API** (taking photos)
- `navigator.mediaDevices.getUserMedia()` requires **WebView-level** camera permission
- On Android, this requires: (a) manifest permission, (b) WebChromeClient granting the PermissionRequest
- On iOS, Capacitor's WKWebView handles this automatically if Info.plist has `NSCameraUsageDescription`
- The `autoplay` attribute ensures the video stream starts without additional user gesture requirements in the WebView context

