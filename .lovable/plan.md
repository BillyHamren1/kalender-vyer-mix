

# Gör det möjligt att byta till RFID-läge i scanner-appen

## Problem
`ScannerModeIndicator` är bara en passiv visning — inga knappar för att byta läge. `RfidStatusBar` med anslut/starta-knappar finns bara inne i `VerificationView`, inte på huvudskärmen i `MobileScannerApp`.

## Lösning
Gör `ScannerModeIndicator` interaktiv med klickbara läges-knappar, och koppla `switchMode` från `useScannerController`.

### 1. `ScannerModeIndicator.tsx` — Lägg till `onModeChange` prop
- Ny valfri prop: `onModeChange?: (mode: ScanMode) => void`
- Visa "Streckkod" och "RFID" som klickbara badges/knappar istället för en enda passiv badge
- Aktivt läge markeras visuellt (filled), inaktivt läge är outline/ghost
- RFID-knappen visas bara om `isRfidReady` är true
- Om `onModeChange` inte skickas, fungerar komponenten som innan (bakåtkompatibel)

### 2. `MobileScannerApp.tsx` — Skicka `onModeChange`
- Lägg till `onModeChange={scanner.switchMode}` på `ScannerModeIndicator`

### 3. `VerificationView.tsx` — Skicka `onModeChange`
- Lägg till `onModeChange` via `scannerState` om det finns tillgängligt

### Filer som ändras
- `src/components/scanner/ScannerModeIndicator.tsx`
- `src/pages/MobileScannerApp.tsx`
- `src/components/scanner/VerificationView.tsx`

