# SiteScan Measure — native iOS module

Den här mappen innehåller Capacitor-bryggan som låter EventFlow Time
öppna den **riktiga** SiteScan-mätvyn (ARKit + SwiftUI) från React.

## Vad som finns här (committat)

- `SiteScanMeasurePlugin.swift` – Capacitor-plugin som JS anropar via
  `useNativeSiteScan().openMeasure()`.
- `SiteScanMeasurePlugin.m` – Obj-C-makro som registrerar pluginet med
  Capacitor-bryggan.
- `SiteScanMeasureHostingController.swift` – UIHostingController som
  presenterar SwiftUI-vyn `MeasureScreen` fullscreen och rapporterar
  tillbaka när användaren stänger den.

## Vad du måste göra en gång i Xcode (kan inte göras från Lovable)

1. **Kopiera in den porterade SiteScanMobile-koden** från
   ScanSphere Manager (`native/SiteScanMobile/`) till denna mapp eller
   en parallell mapp i App-targeten. Minst dessa filer behövs för att
   `MeasureScreen` ska bygga:

   ```
   Screens/MeasureScreen.swift
   Screens/CalibrationSheet.swift
   ViewModels/MeasureViewModel.swift
   Views/ARMeasureView.swift
   Services/ARSessionManager.swift
   Services/CameraPermissionManager.swift
   Services/DeviceCapabilityService.swift
   Services/GeoService.swift
   Services/UploadManager.swift              (kan stubbbas om upload inte används)
   State/AppState.swift
   Models/MeasureCapture.swift
   Models/CalibrationPoint.swift
   Models/CoreTypes.swift
   Models/ScanMode.swift
   Models/DeviceCapabilityState.swift
   Design/Theme.swift
   Design/Components/ScanActionButton.swift
   Design/Components/MeasurementReadout.swift   (om den finns separat)
   Design/Components/CrosshairOverlay.swift     (om den finns separat)
   Design/Components/PermissionPromptView.swift
   Design/Components/SessionErrorAlert.swift
   Design/Components/ARCameraPlaceholder.swift  (för icke-ARKit-targets)
   ```

   Plus eventuella små helpers som ovanstående filer importerar.

2. **Lägg till frameworks** i App-targeten:
   - `ARKit.framework` (Required)
   - `SceneKit.framework`
   - `CoreLocation.framework` (om GeoService används)

3. **Verifiera Info.plist-nycklar** (redan satt via
   `capacitor.time.config.ts`):
   - `NSCameraUsageDescription`
   - `NSLocationWhenInUseUsageDescription`

4. **Bygg.** `npx cap sync ios` registrerar pluginet automatiskt
   tack vare `@objc(SiteScanMeasurePlugin)`-deklarationen.

## Resultatkoppling

`MeasureScreenWrapper` i `SiteScanMeasureHostingController.swift` är
medvetet en tunn wrapper. När du har den porterade `MeasureScreen` på
plats kan du modifiera wrappern för att skicka `MeasureCapture` →
`UploadManager` → backend, och anropa `onSaved(scanId)` när raden är
synkad till `site_scans`-tabellen. Då navigerar React automatiskt till
`/m/tools/measure/:id`.

Tills uppladdningskedjan är inkopplad räcker det att stänga vyn — då
loggas mätningen lokalt och React landar tillbaka i listan.
