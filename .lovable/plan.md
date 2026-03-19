

# Fix: Gör ScannerDebugPanel funktionell

## Problem
Debug-panelen skapar en separat `useScannerController({ autoInit: false })` som varken pollar state eller har en aktiv scan-handler. Resultatet: statisk data, knappar utan respons.

## Lösning

### Ändra `ScannerDebugPanel.tsx`
1. **Lägg till egen state-polling** oberoende av `autoInit` — panelen ska läsa `getState()` direkt från singletonen med ett intervall
2. **Simuleringsknapparna** ska anropa simuleringsfunktionerna direkt (de fungerar redan mot singletonen som MobileScannerApp initierat), men panelen behöver polla för att visa resultatet
3. Alternativt: byt till `autoInit: true` — detta är säkert eftersom `initScanner` redan hanterar re-init med `destroyScanner()` först. Men det kan orsaka en kort avbrott.

**Föredragen approach:** Importera `getState` direkt från `ScannerService` och polla med `setInterval` i panelen. Behåll `autoInit: false` för att inte störa den aktiva scannern.

### Konkret ändring
- Importera `getState` från `ScannerService`
- Lägg till en `useEffect` med `setInterval(() => setState(getState()), 500)` för live-uppdatering
- Simuleringsknapparna funkar redan (de skickar events till singletonen) — de behöver bara state-polling för att visa resultatet

### Fil
- `src/components/scanner/ScannerDebugPanel.tsx` — enda filen som behöver ändras

