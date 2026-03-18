

## Plan: Minus-läge (toggle) i VerificationView

Lägger till en toggle-knapp i scanner-vyn som växlar mellan **plus-scanning** (standard) och **minus-scanning**. När minus-läge är aktivt minskar varje scan (hårdvara eller QR) kvantiteten med 1 istället för att öka den.

### UI-ändringar

**VerificationView.tsx** — Progress-raden (rad 551-579):
- Lägg till en toggle-knapp **"−"** bredvid QR- och Kolli-knapparna
- Aktiv = röd bakgrund + tydlig visuell indikator så användaren ser att minus-läge är på
- "Senast scannad"-headern visar **"➖ Borttagen:"** istället för ✅ vid minus-scan

**Scan-logik** i `handleScan` (rad 252-310):
- Ny state: `isMinusMode`
- Om `isMinusMode === true`: anropa `decrementPackingItem` istället för `verifyProductBySku`
- Behöver dock matcha SKU → itemId lokalt (API:t för decrement tar `itemId`, inte SKU)
- Lösning: hitta första matchande item i `items`-listan med samma SKU och `quantity_packed > 0`, anropa `decrementPackingItem(itemId)`
- Optimistisk uppdatering: minska `quantity_packed` med 1 lokalt

**Manuell toggle** i `handleManualToggle` (rad 320-355):
- Om `isMinusMode`: anropa `decrementPackingItem` istället för `togglePackingItemManually`

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/components/scanner/VerificationView.tsx` | Ny state `isMinusMode`, toggle-knapp i toolbar, ändrad logik i `handleScan` och `handleManualToggle` |

### Ingen backend-ändring krävs
`decrementPackingItem` finns redan i `scannerService.ts` och edge function.

