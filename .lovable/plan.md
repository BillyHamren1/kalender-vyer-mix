

# Fix: RFID-statusbar visar fel + felruta kan inte stängas

## Problem 1: "RFID: Ej ansluten" trots att readern är ansluten
Det finns två separata RFID-tillståndssystem:
- **ScannerService** auto-ansluter readern vid start och spårar `readerStatus` korrekt → `ScannerModeIndicator` visar "RFD" (rätt)
- **useRfidManager** har ett eget oberoende state som startar som `disconnected` → `RfidStatusBar` visar "Ej ansluten" (fel)

`useRfidManager` försöker hämta status via `getRfidReaderStatus()` vid mount, men om ScannerService redan auto-anslutit readern genom en annan väg, eller om native-pluginet inte returnerar status korrekt, hamnar de ur synk.

**Fix:** Synka `RfidStatusBar` med `scannerState` från ScannerService istället för att förlita sig på `useRfidManager` separat.

### Ändring i `src/components/scanner/VerificationView.tsx`
- Skicka `scannerState.isReaderConnected` till `RfidStatusBar` och låt den overrida status till `connected` om ScannerService rapporterar att readern är ansluten
- Alternativt: i `useRfidManager`, lyssna på `RFID_STATUS_EVENT` från `ZebraRfidBridge` så att om ScannerService auto-ansluter, uppdateras `useRfidManager` state automatiskt

### Ändring i `src/hooks/scanner/useRfidManager.ts`
- Lägg till en `useEffect` som lyssnar på `rfid_reader_status`-event (samma som ZebraRfidBridge dispatchar) och uppdaterar state när readern ansluts/kopplas från externt (t.ex. via ScannerService auto-connect)

## Problem 2: Röda felrutan kan inte stängas
När en okänd kod scannas visas en röd container med felmeddelande (`lastScanResult` med `success: false`), men det finns ingen stäng-knapp.

### Ändring i `src/components/scanner/VerificationView.tsx`
- Lägg till en X-knapp i felrutan (rad 436-449) som anropar `setScanResult(null)` för att rensa feedbacken

## Filer som ändras
1. `src/hooks/scanner/useRfidManager.ts` — lyssna på `rfid_reader_status`-event för att synka med ScannerService
2. `src/components/scanner/VerificationView.tsx` — lägg till dismiss-knapp på scanresultat-rutan

