

## Analys: Varför scannern nollställs

Jag har hittat **flera sammankopplade buggar** som tillsammans orsakar att scannerprocessen "nollställs" efter 5-6 rader.

### Rotorsaker

**1. Bakgrundssynk visar fullskärmsspinner (VerificationView)**
`loadData()` kör `setIsLoading(true)` varje gång den anropas — inklusive vid bakgrundssynk 2 sekunder efter varje scan. Detta ersätter hela produktlistan med en spinner och laddar om allt från servern. Känslan blir att allt "nollställs".

**2. Stale closure på `itemOrder` (båda vyerna)**
`loadData` fångar `itemOrder` från första renderingen (`{}`). Eftersom `packingId` aldrig ändras återskapas aldrig callbacken. Varje gång `loadData` körs tror den att det är första laddningen och nollställer ordningen.

**3. Bakgrundssynk skriver över optimistiska uppdateringar**
`setItems(typedItems)` och `setProgress(progressData)` ersätter lokalt uppdaterad state med serverdata. Om servern är långsam att svara kan checkade rader tillfälligt se omarkerade ut.

**4. Dubbla scanner-controllers**
Både MobileScannerApp (parent) och VerificationView har egna `useScannerController` med `autoInit: true`. Varje DataWedge-scan triggar **båda**. Parent-controllern kör `handleBarcodeScan()` som visar feltoasts och potentiellt kan ändra packing-ID (om barkoden matchar UUID-formatet), vilket avmonterar hela VerificationView och förlorar all lokal state.

### Planerade åtgärder

**A. Separera initial laddning från bakgrundssynk** (`VerificationView.tsx` + `ManualChecklistView.tsx`)
- Ta bort `setIsLoading(true)` från bakgrundssynk — bara vid initial laddning
- Skapa en `backgroundRefresh()` funktion som uppdaterar data tyst utan spinner
- Behåll lokal optimistisk state om serverdatan inte har hunnit ikapp (jämför `quantity_packed` — behåll det högre värdet)

**B. Fixa stale closure på `itemOrder`**
- Använd `useRef` istället för `useState` för `itemOrder` så att `loadData` alltid läser det aktuella värdet

**C. Inaktivera parent scanner controller i child-vyer**
- Lägg till `autoInit: false` på scanner-controllern i MobileScannerApp när `state !== 'home'`, eller
- Skicka `state` som context och skippa `onScan` i parent när vi är i verifying/manual läge

**D. Skydda mot UUID-barkoder i parseScanResult**
- Lägg till en extra kontroll så att UUID-barkoder inte omtolkas som packing-ID när vi redan är inne i en verifieringsvy

### Filer som ändras
- `src/components/scanner/VerificationView.tsx` — bakgrundssynk utan spinner, ref-baserad itemOrder
- `src/components/scanner/ManualChecklistView.tsx` — samma fixar
- `src/pages/MobileScannerApp.tsx` — inaktivera parent scanner controller i child-vyer

