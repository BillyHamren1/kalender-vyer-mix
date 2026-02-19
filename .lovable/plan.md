

# Manuell koppling av leverantorsfakturor mot kostnadsposter

## Sammanfattning
Gor det mojligt att manuellt lanka en leverantorsfaktura (fran Fortnox) till en kostnadspost i projektets budget -- inkop, produktkostnad, eller budgetpost. Anvandaren valjer koppling via en dropdown direkt i SupplierInvoicesCard-tabellen. Kopplingen sparas via `planning-api-proxy` till Booking-systemets nya falt `linked_cost_type` och `linked_cost_id`.

## Andringar

### 1. Uppdatera typdefinitionen
**Fil:** `src/types/projectEconomy.ts`
- Lagg till `linked_cost_type` och `linked_cost_id` pa `SupplierInvoice`-interfacet (behall `linked_product_id` for bakåtkompatibilitet)

### 2. Lagg till PUT-funktion i planningApiService
**Fil:** `src/services/planningApiService.ts`
- Ny export `updateSupplierInvoiceLink(id, data)` som anropar `callPlanningApi` med `type: 'supplier_invoices'`, `method: 'PUT'`

### 3. Ny mutation i useProjectEconomy
**Fil:** `src/hooks/useProjectEconomy.tsx`
- Ny `linkSupplierInvoiceMutation` som anropar `updateSupplierInvoiceLink`
- Invaliderar `['supplier-invoices', bookingId]` vid framgang
- Exportera `linkSupplierInvoice` fran hooken

### 4. Uppdatera SupplierInvoicesCard
**Fil:** `src/components/project/SupplierInvoicesCard.tsx`
- Ta emot nya props: `purchases`, `productCosts`, `budget`, `onLinkInvoice`
- Ny kolumn "Kopplad till" i tabellen
- Varje rad far en Select-komponent med grupperade alternativ:
  - **Inkop**: listar alla purchases med beskrivning + belopp
  - **Produktkostnader**: listar produkter med namn + kostnad
  - **Budgetpost**: visar budgetraden
  - **Ingen koppling**: nollstaller
- Olankade fakturor far en gul varningsikon
- Lankade fakturor visar typ + namn

### 5. Skicka data till SupplierInvoicesCard
**Fil:** `src/components/project/ProjectEconomyTab.tsx`
- Skicka `purchases`, `productCosts`, `budget` och `linkSupplierInvoice` som props till `SupplierInvoicesCard`

## Tekniska detaljer

### API-anrop for att spara koppling
```text
callPlanningApi({
  type: 'supplier_invoices',
  method: 'PUT',
  id: '<supplier_invoice_id>',
  data: {
    linked_cost_type: 'purchase' | 'product' | 'budget' | null,
    linked_cost_id: '<id>' | null
  }
})
```
Detta routas via `planning-api-proxy` till Booking-systemets `planning-api`.

### Forutsattning
Booking-systemets `planning-api` maste stodja `PUT` pa `supplier_invoices` med de nya falten. Om det inte ar implementerat annu kommer kopplingen inte sparas -- men UI:t visas korrekt och fungerar nar API:t ar klart.

