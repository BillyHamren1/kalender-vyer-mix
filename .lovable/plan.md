

## Problem
When scanning from the home screen, any non-packing-ID scan just shows "QR-koden innehåller inte en giltig packlista" — no useful info. The user wants a product lookup here. But inside a packing list (VerificationView), scanning a wrong product must still show an error like "Artikel ej i packlista" — no lookup.

## Plan

### Scope
- **Home screen scan** → non-UUID barcodes trigger product identification (new feature)
- **Packing list scan** → wrong SKUs keep showing error as today (NO change)

### Changes

**1. Edge function: add `identify_product` action**
File: `supabase/functions/scanner-api/index.ts`

Add a new case that calls the external inventory API to look up a product by serial/barcode (read-only, no allocation). Returns product name, SKU, status, current allocation. Falls back to local DB match if external API lacks a lookup endpoint.

**2. Service layer: add `identifyProduct` helper**
File: `src/services/scannerService.ts`

```typescript
export const identifyProduct = async (serialOrSku: string) => {
  return callScannerApi('identify_product', { serialNumber: serialOrSku });
};
```

**3. New component: ProductIdentifyCard**
File: `src/components/scanner/ProductIdentifyCard.tsx`

Simple overlay card showing: product name, SKU, status, current booking (if allocated). Dismiss button to close.

**4. Update home screen scan handler only**
File: `src/pages/MobileScannerApp.tsx`

Change `handleBarcodeScan` else-branch:
- Before: `toast.error('QR-koden innehåller inte en giltig packlista')`
- After: call `identifyProduct(scannedValue)` → show `ProductIdentifyCard` overlay with result, or toast if not found

**No changes to:**
- `useScanProcessor.ts` — packing list scanning stays exactly as-is
- `VerificationView` — wrong SKUs still get "not found" error from `verify_product`
- DataWedge/RFID bridge, Time app, kolli flow — untouched

### Technical notes
- The `activeScanHandler` ref already switches between home handler and verification handler based on state, so the two contexts are cleanly separated
- Need to check if external inventory API has a lookup endpoint; if not, fall back to matching SKU against `booking_products` table locally

