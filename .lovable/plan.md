

# Diagnos: Scanner fungerar inte efter refaktorering

## Vad loggarna visar

Edge function `scanner-api` loggade **inga requests alls** — bara "booted" och "shutdown". Inga errors. Det betyder att anropet från appen aldrig nådde funktionen, eller att appen inte skickade något.

## Trolig orsak: `useScanProcessor` dependency-bug

I den nya `useScanProcessor.ts` har `processNext` en `useCallback` med dependencies `[packingId, verifierName]`, men `processNormalScan` och `processMinusScan` är **vanliga funktioner inuti hooken** som fångar stale closures av `getItems`, `onScanResult`, etc.

Dock är det **mest sannolika problemet** att `enqueueScan` inte registreras korrekt med `registerScanHandler` i VerificationView, eller att `registerScanHandler` uppdaterar referensen men DataWedge-bridgen håller kvar en gammal/tom handler.

Låt mig spåra det exakta flödet:

1. `VerificationView` anropar `registerScanHandler(enqueueScan)` via useEffect (rad 115-119)
2. `enqueueScan` är en `useCallback` som beror på `processNext`
3. `processNext` är en `useCallback` som beror på `[packingId, verifierName]`
4. Men `processMinusScan` och `processNormalScan` definieras som **vanliga async-funktioner** inuti hooken — de är **inte** i dependency-arrayen men refereras från `processNext`

**Problem:** `processNext` återskapas bara om `packingId`/`verifierName` ändras. Men `processMinusScan`/`processNormalScan` fångar closures vid hookens **första render**, inte vid uppdateringar. Dock borde detta inte orsaka en total krasch.

## Mer sannolikt: Appen bootade om

Du sa "den bootade". Det kan betyda:
- Appen laddades om (hot reload efter deployment)
- Appen kraschade under rendering

Det mest troliga scenariot: **Appen fick en ny deployment** (jag deployade `scanner-api` + ändrade frontend-kod), vilket utlöste en omstart. Efter omstarten kanske auth-session försvann eller scan-handler inte registrerades korrekt.

## Plan för att åtgärda

### 1. Lägg till defensiv felhantering i `useScanProcessor`
- Wrappa hela `processNext` i try/catch med console.error (inte bara i finally)
- Logga `scanLog('process_error', err)` vid alla fel

### 2. Säkerställ att `enqueueScan` alltid har aktuella refs
- Ändra `processNormalScan` och `processMinusScan` till att använda refs istället för closures
- Garantera att `getItems()`, `onScanResult()` etc. alltid har senaste värden

### 3. Lägg till console.log i `callScannerApi` vid network-anrop
- Temporärt: logga vad som skickas till scanner-api så vi ser om anropet ens görs

### 4. Skydda mot tom scan-handler
- I `enqueueScan`: validera att value inte är tom/undefined
- I VerificationView `registerScanHandler`-effekten: logga registrering

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/hooks/scanner/useScanProcessor.ts` | Bättre error-logging, ref-baserade callbacks |
| `src/services/scannerService.ts` | Debug-log i `callScannerApi` |

Ingen ändring av DataWedge, ScannerService, bridge eller UI.

