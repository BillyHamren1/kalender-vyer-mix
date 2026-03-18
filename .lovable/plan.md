

## Problem: Dubbla scanner-kontroller orsakar race condition

### Rotorsak

Scanner-appen har **två separata `useScannerController`-instanser** som slåss om samma singleton `ScannerService`:

1. **MobileScannerApp** (parent): `autoInit: isHome` — destroys scanner when navigating to VerificationView
2. **VerificationView** (child): `autoInit: true` — tries to init its own scanner

React's effect execution order innebär att förälderns `destroyScanner()` kan köras **efter** att barnets `initScanner()` redan startat DataWedge-lyssnaren. Resultatet: scannern dör tyst, och användaren måste öppna QR-överlagringen (som bara är en manuell-input-fallback på Zebra) för att skanna.

### Lösning: En enda scanner-kontroller i parent, callback-ref till child

**Steg 1: MobileScannerApp — alltid aktiv scanner**
- Ändra `autoInit: isHome` → `autoInit: true` (scannern lever hela tiden)
- Skapa en `scanCallbackRef` som pekar på rätt handler beroende på `state`:
  - `home` → `handleBarcodeScan` (letar efter packing-ID)
  - `verifying` → vidarebefordra till VerificationView's `handleScan`
- Skicka en `onExternalScan` callback-prop till `VerificationView`

**Steg 2: VerificationView — ta bort egen scanner-kontroller**
- Ta bort `useScannerController` helt
- Ta bort `ScannerModeIndicator` (den visas redan i parent, eller flytta den)
- Lägg till prop `onExternalScan?: (handler: (value: string) => void) => void` — ett register-pattern där VerificationView registrerar sin `handleScan` hos parent
- Alternativt, enklare: prop `ref` eller `onScanRef` pattern

**Steg 3: Ta bort QR-knappen som krav för scanning**
- QR-knappen (`Camera`-ikonen) behålls som **valfri fallback** för manuell inmatning
- Listan ska alltid vara synlig — hardware-scanningar ska gå direkt till `handleScan` utan att öppna QR-overlay
- Ingen ändring i listan behövs — den fungerar redan korrekt med `handleScan`

### Exakt implementation

**MobileScannerApp.tsx:**
```tsx
// Single scan callback ref — points to the active handler
const activeScanHandler = useRef<(value: string) => void>(handleBarcodeScan);

const scanner = useScannerController({
  onScan: useCallback((scan: ScanEvent) => {
    if (scan.isDuplicate) return;
    if (scan.type === 'barcode') {
      activeScanHandler.current(scan.value);
    }
  }, []),
  autoInit: true,  // Always active
});

// Update ref when state changes
useEffect(() => {
  if (state === 'home') {
    activeScanHandler.current = handleBarcodeScan;
  }
}, [state, handleBarcodeScan]);

// Pass registration function to VerificationView
<VerificationView
  packingId={selectedPackingId}
  onBack={goHome}
  registerScanHandler={(handler) => { activeScanHandler.current = handler; }}
  scannerState={scanner}  // pass mode indicator data
/>
```

**VerificationView.tsx:**
- Ny prop: `registerScanHandler: (handler: (value: string) => void) => void`
- Ny prop: `scannerState` (för ScannerModeIndicator)
- `useEffect` som registrerar `handleScan` via `registerScanHandler`
- Ta bort `useScannerController` och `handleScanRef`

### Resultat
- Hardware-scanningar (DataWedge) flödar direkt till rätt vy utan knapptryck
- Listan förblir synlig hela tiden
- QR-knappen kvar som fallback för manuell input
- Ingen race condition — en enda ScannerService-instans hela appens livstid

