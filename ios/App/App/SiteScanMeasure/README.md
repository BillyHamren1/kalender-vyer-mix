# SiteScanMeasure — native iOS Measure module

Self-contained ARKit measurement module for EventFlow Time, exposed to React via the `SiteScanMeasure` Capacitor plugin.

## Files
- `SiteScanMeasurePlugin.swift` / `.m` — Capacitor plugin (`openMeasure`)
- `SiteScanMeasureHostingController.swift` — UIHostingController wrapper
- `Models/MeasureModels.swift` — ScanMode, MeasurementPoint/Result, MeasureCapture, GeoPoint
- `Design/Theme.swift` — Spacing/radius tokens + surfaceSecondary color
- `Services/ARSessionManager.swift` — ARSession lifecycle
- `ViewModels/MeasureViewModel.swift` — Measurement state machine
- `Views/ARMeasureView.swift` — ARSCNView (raycast + render)
- `Screens/MeasureScreen.swift` — Top-level SwiftUI screen

## Xcode setup (one-time, manual after `npx cap sync ios`)
1. Project navigator → right-click `App` → *Add Files to "App"* → select the `SiteScanMeasure` folder, "Create groups", target **App** checked.
2. App target → General → Frameworks: add `ARKit.framework` and `SceneKit.framework`.
3. Verify `NSCameraUsageDescription` in Info.plist (already in `capacitor.time.config.ts`).
4. Build on a **physical iPhone** — ARKit doesn't work in the Simulator.

## JS usage
```ts
const { isAvailable, openMeasure } = useNativeSiteScan();
if (isAvailable) {
  const result = await openMeasure({ bookingId, title: 'Lasthöjd port 1' });
  // { saved, scanId, measurementCount, capture: { measurements: [...] } }
}
```

## Notes
- No dependency on SiteScan backend (no AppState/Auth/Upload/Geo). Result is handed to JS for persistence in EventFlow's Supabase.
- Uses `ARWorldTrackingConfiguration` with smoothed scene depth on LiDAR devices — same as the original SiteScan MeasureScreen.
