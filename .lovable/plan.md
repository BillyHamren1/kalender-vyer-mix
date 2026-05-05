
## Mål

Planning scanner UI ska använda nya WMS-backed `physical_return_scan` för fysiska scan/RFID/QR-input. `returnScanSku` får bara användas som manuell SKU/namn-fallback. 401 ska gå till `/scanner/login`.

## Filer

- `src/services/scannerService.ts`
- `src/components/scanner/ReturnView.tsx`

## Ändringar

### `src/services/scannerService.ts`

1. **Auth redirect** (rad 46–48): byt `'/login'` → `'/scanner/login'`.
2. **Ny export `physicalReturnScan`** bredvid `returnScanSku`:
   ```ts
   export const physicalReturnScan = async (
     packingId: string,
     scannedValue: string,
     returnedBy?: string,
   ): Promise<ReturnScanResult & { alreadyReturned?: boolean; debugCode?: string; wms?: any }> => {
     try {
       return await callScannerApi('physical_return_scan', { packingId, scannedValue, returnedBy });
     } catch (err: any) {
       return { success: false, error: err?.message || 'Scan failed', debugCode: err?.debugCode };
     }
   };
   ```
3. Utöka `ReturnScanResult` med valfria `alreadyReturned?: boolean` och `wms?: { item_type_id?: string; sku?: string; instance_id?: string }`.

### `src/components/scanner/ReturnView.tsx`

1. Importera `physicalReturnScan` från service.
2. Splitta scan-flödet i två kanaler:
   - **`handleHardwareScan(raw)`** — anropas via `registerScanHandler` (RFID/QR/serial/datawedge). Använder `physicalReturnScan`.
   - **`handleManualSubmit(raw)`** — anropas av formuläret i Input-fältet. Använder kvarvarande `returnScanSku` (manuell SKU/namn).
3. Behåll `setScanInput('')`, optimistic state-uppdatering och `flashHighlight` i båda paths.
4. **Tydlig feedback** i `setLastResult` baserat på response:
   - `res.success && !res.alreadyReturned` → grön "+1 returnerad (x/y)".
   - `res.success && res.alreadyReturned` → amber/gul "Redan returnerad (x/y)" (info, ingen toast.error).
   - `res.success === false && res.debugCode === 'LOCAL_RETURN_MATCH_MISSING'` → röd "WMS godkände scan men ingen rad matchar packlistan (item_type=…, sku=…)" + `toast.warning`.
   - `res.success === false` övrigt → röd "WMS-fel: <error>" + `toast.error`.
5. Lägg till `'amber'`/`'info'` variant i `lastResult` (utöka union till `{ success: boolean; level?: 'success'|'warning'|'error'; text; productName }`) och färglägg banner med befintliga klasser (emerald/amber/red).
6. Efter lyckad scan (även `alreadyReturned`) → `loadData()` så progress refreshas. (Realtime sköter normalfall, men explicit refresh garanterar att en delvis fail-then-success ändå syncar.)
7. Manuell `+`/`-`/reset på rader förblir oförändrade (de är manuella admin-knappar, inte fysisk scan).
8. Uppdatera input placeholder/text till "Skriv SKU eller produktnamn manuellt — fysiska scans hanteras av läsaren" för att tydliggöra att Input-fältet är manuell fallback.

## Vad som INTE ändras

- `returnScanSku`, `returnToggleItem`, `returnDecrementItem`, `returnResetItem` finns kvar (manuell väg).
- Visuell layout/färgsystem (bara nya states färgläggs konsekvent).
- Realtime-prenumerationen.
- Andra ScannerProtectedRoute-flöden eller VerificationView (UT-flödet).
