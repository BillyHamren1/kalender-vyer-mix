

# Scanner App - Komplett kodöversikt och Android-uppdatering

## Arkitektur

```text
┌─────────────────────────────────────────────────────────┐
│  App.tsx                                                 │
│  └─ VITE_APP_MODE=scanner → ScannerAppShell             │
│       └─ MobileAuthProvider                              │
│            ├─ /scanner/login → ScannerLogin              │
│            └─ /scanner → ScannerAppLayout                │
│                 └─ MobileScannerApp (huvudkomponent)      │
│                      ├─ Home: packlista + QR-scanner      │
│                      ├─ verifying → VerificationView      │
│                      └─ manual → ManualChecklistView      │
└─────────────────────────────────────────────────────────┘
```

## Nyckelflöden

### 1. Scanning-pipeline
```text
Zebra DataWedge (hårdvara)
  → BroadcastReceiver (DataWedgePlugin.java)
    → Capacitor event "datawedge_scan"
      → DataWedgeBridge.ts (native listener)
        → ScannerService.handleIncomingScan()
          → dedup + ScanQueue
            → useScannerController.onScan callback
              → activeScanHandler.current (dynamisk delegation)
                ├─ Home: parseScanResult → navigera till packlista
                └─ Verifying: useScanProcessor → optimistic update
```

### 2. RFID-pipeline (samma mönster)
```text
Zebra RFD4030 → ZebraRfidPlugin.java → "rfid_tag" event
  → ZebraRfidBridge.ts → ScannerService → samma callback-kedja
```

### 3. Kamera-fallback
QRScanner.tsx (jsQR + BarcodeDetector API) → submitManualScan → samma pipeline

## Filinventering

### Android Native (Java)
| Fil | Ansvar |
|-----|--------|
| `MainActivity.java` | Registrerar plugins, beviljar WebView kamerabehörigheter |
| `DataWedgePlugin.java` | BroadcastReceiver för `se.eventflow.scanner.SCAN`, vidarebefordrar till WebView |
| `ZebraRfidPlugin.java` | RFID SDK-brygga (kräver manuell rfidapi3.aar) |

### Capacitor-konfiguration
| Fil | Ansvar |
|-----|--------|
| `capacitor.scanner.config.ts` | appId: `se.eventflow.scanner`, webDir: `dist` |
| `capacitor.config.ts` | EventFlow Time (separat app) |
| `.env.scanner` | `VITE_APP_MODE=scanner` |

### Scanner Service Layer (TypeScript)
| Fil | Ansvar |
|-----|--------|
| `ScannerService.ts` | Singleton orchestrator — init, destroy, dedup, state |
| `DataWedgeBridge.ts` | Capacitor plugin listener + web fallback |
| `ZebraRfidBridge.ts` | RFID plugin listener + tag-tracking + simulation |
| `KeyboardFallbackBridge.ts` | HID-tangentbordsfallback för icke-Zebra |
| `ScanQueue.ts` | Offline-kö med sync-status |
| `platform.ts` | Plattformsdetektering (Zebra, Android, Web) |
| `types.ts` | ScanEvent, ScanMode, ScannerState, ScannerConfig |

### React Hooks
| Fil | Ansvar |
|-----|--------|
| `useScannerController.ts` | Central hook — init, mode switch, RFID-kontroller |
| `useScanProcessor.ts` | FIFO-kö, sekventiell processing per scan |
| `useOptimisticPacking.ts` | Optimistisk UI-uppdatering av kvantiteter |
| `usePackingSync.ts` | Backend-synk med Math.max-strategi |
| `useKolliManager.ts` | Kolli/parcel-hantering |
| `useScanFeedback.ts` | Visuell/ljud-feedback vid scan |
| `useRfidManager.ts` | RFID-inventering och tag-matching |
| `useScannerRealtime.ts` | Supabase Realtime + 30s polling fallback |

### UI-komponenter
| Fil | Ansvar |
|-----|--------|
| `MobileScannerApp.tsx` | Huvudsida — hemlista, state-routing, activeScanHandler |
| `VerificationView.tsx` | Scannings-/verifieringsvy (555 rader) |
| `ManualChecklistView.tsx` | Manuell bocka-av-vy |
| `QRScanner.tsx` | Kamera-scanner med jsQR fallback |
| `ScannerDebugPanel.tsx` | Debug-panel med simulering |
| `ScannerModeIndicator.tsx` | Barcode/RFID-statusindikator |
| `PackingSelector.tsx` | Packlistval |
| `BluetoothRFID.tsx` | Bluetooth RFID-status |

### Backend
- Edge function: `scanner-api` (Supabase) — hanterar auth, packing CRUD, parcel, status
- API-anrop via `scannerService.ts` med hardcoded Supabase-URL
- Tabeller: `packing_projects`, `packing_list_items`, `bookings`, `packing_sync_log`

## Android Build-process

```text
1. VITE_APP_MODE=scanner npm run build     # Bygger till dist/
2. Kopiera capacitor.scanner.config.ts → capacitor.config.ts
3. npx cap sync android                     # Synkar dist → android/
4. Öppna android/ i Android Studio
5. Build & run (eller npx cap run android)
```

Alternativt: `npm run android:scanner` (använder `scripts/build-android.js`)

## Konfigurationskrav på enhet
- DataWedge-profil krävs (se `docs/zebra-datawedge-setup.md`)
- Intent Action: `se.eventflow.scanner.SCAN`, Broadcast, Keystroke OFF
- RFID kräver manuell placering av `rfidapi3.aar` i `android/app/libs/`

## Sammanfattning

Hela scanner-appen är en React SPA som körs i en Capacitor WebView på Android. Den har tre skanningskällor (DataWedge, RFID, kamera) som alla matas genom en central ScannerService med deduplicering och en FIFO-kö. Native Java-plugins (DataWedgePlugin + ZebraRfidPlugin) registreras i MainActivity och kommunicerar via Capacitor events. Backend-kommunikation sker via `scanner-api` edge function med token-baserad auth.

För att uppdatera appen på Android behöver du:
1. Pusha/pulla senaste koden
2. Köra `npm run build:scanner`
3. Köra `npx cap sync android` (med rätt capacitor.config.ts)
4. Bygga APK/AAB i Android Studio

