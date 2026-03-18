

# Refaktorering av VerificationView — Plan

## Sammanfattning

Bryt ut all logik från VerificationView.tsx (895 rader) till 5 dedikerade hooks. Ingen beteendeändring, ingen UI-ändring, ingen ändring av DataWedge/ScannerService/routing.

## Nya filer

### 1. `src/hooks/scanner/useScanProcessor.ts`
**Ansvar:** FIFO scan-kö med lås, processerar en scan i taget.

- Intern kö (array ref) + `isProcessing` lock
- `enqueueScan(value: string)` — lägger till i kö, startar processing om idle
- `processNext()` — tar nästa från kön, anropar rätt logik beroende på minus-mode
- **Normal mode:** anropar `verifyProductBySku()`, returnerar `{ success, itemId, productName, overscan, error }`
- **Minus mode:** hittar matchande item via SKU, anropar `decrementPackingItem()`
- Filtrerar bort `packing_id`-scans (tyst ignorering)
- Returnerar status per scan till callback: `onScanResult(result)`
- Tydlig felhantering: item not found, over-scan, invalid barcode, API-fel — alla returnerar status, ingen throw

### 2. `src/hooks/scanner/useOptimisticPacking.ts`
**Ansvar:** Lokal items-state med optimistisk uppdatering.

- `items`, `setItems` state
- `itemOrderRef` för stabil sortering
- `applyOptimisticIncrement(itemId)` — +1 på quantity_packed
- `applyOptimisticDecrement(itemId)` — -1, min 0
- `mergeServerData(serverItems)` — `Math.max(local, server)` per item, behåller stabil ordning
- `recalcProgress(items)` — beräknar total/verified/percentage (befintlig logik)
- Exporterar `items`, `progress`, `isLoading`, `loadData()`

### 3. `src/hooks/scanner/usePackingSync.ts`
**Ansvar:** Bakgrundssynk med debounce.

- `debouncedSync()` — 2s debounce, anropar `loadData(true)` i bakgrunden
- `triggerSync()` — exponeras för hooks som behöver starta sync efter scan
- Cleanup av timer vid unmount
- **Regel:** merge via `useOptimisticPacking.mergeServerData` som aldrig minskar lokalt värde

### 4. `src/hooks/scanner/useKolliManager.ts`
**Ansvar:** All kolli/parcel-logik.

- `isKolliMode`, `activeParcel`, `itemParcelMap` state
- `startKolli(packingId, verifierName)` — skapar parcel, sätter active
- `nextKolli(packingId, verifierName)` — skapar nästa parcel
- `exitKolli()` — stänger läge
- `assignToKolli(itemId)` — kopplar scan till aktiv parcel
- `loadParcels(packingId)` — hämtar initial parcelMap

### 5. `src/hooks/scanner/useScanFeedback.ts`
**Ansvar:** UI-feedback state.

- `lastScanResult` state (value, result, success, productName, isMinusScan)
- `highlightedItemId` + auto-clear timer (1.5s)
- `setScanResult(result)` och `highlightRow(itemId)`

## Debug-logging

En enkel `scanLog(event, data)` utility som loggar till console när `localStorage.getItem('SCAN_DEBUG') === '1'`. Anropas i useScanProcessor vid: scan received, item matched, quantity updated, sync triggered.

## Ändrad fil

### `src/components/scanner/VerificationView.tsx`
Reduceras till ~200 rader. Anropar de 5 hooks, renderar UI. All logik borta. Inga nya props, inga nya API-kontrakt.

```text
VerificationView
  ├── useOptimisticPacking(packingId)    → items, progress, loadData, mergeServerData
  ├── usePackingSync(loadData)           → triggerSync
  ├── useScanFeedback()                  → lastScanResult, highlightedItemId
  ├── useKolliManager(packingId)         → isKolliMode, activeParcel, ...
  └── useScanProcessor(items, ...)       → enqueueScan (registered with parent)
```

## Krav som uppfylls

| Krav | Lösning |
|------|---------|
| FIFO, inga tappade scans | Intern kö i useScanProcessor med lock |
| Exakt 1 gång per scan | Lock förhindrar parallell processing |
| Backend får aldrig minska lokalt | `Math.max(local, server)` i mergeServerData |
| Tydlig felhantering | Alla feltyper returnerar status, ingen crash |
| Kolli isolerat | Egen hook, anropas bara vid behov |
| Debug-logging | Toggle via localStorage |

