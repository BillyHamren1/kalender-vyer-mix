

# Leverantorsfakturor (Fortnox) i projektets ekonomiflik

## Bakgrund
Booking-systemet har en separat Edge Function (`fortnox-supplier-invoices`) som hamtar leverantorsfakturor fran Fortnox och cachar dem i tabellen `booking_supplier_invoices`. Fakturorna kan lankas till specifika produkter via `linked_product_id`. Denna data visas redan i Bookings UI men ar INTE tillganglig har -- varken via `planning-api` eller i projektets ekonomiflik.

## Problem
1. `planning-api` i Booking exponerar INTE `supplier_invoices` som en typ (bara budget, purchases, quotes, invoices, time_reports, product_costs)
2. Det finns inget satt for detta system att hamta leverantorsfakturor
3. Ekonomifliken visar inte denna datakalla

## Losning

### Steg 1: Be Booking lagga till `supplier_invoices` i planning-api
Planning-api:n behover utvidgas med en ny typ. Alternativt kan vi anropa `fortnox-supplier-invoices` direkt via proxyn. Eftersom `fortnox-supplier-invoices` kraver `bookingNumber` (inte booking_id) och autentisering via JWT (inte API-key), behover vi anpassa.

**Rekommendation**: Lagg till `supplier_invoices` som ny typ i Bookings `planning-api`. Da foljer den samma monster som allt annat. Booking-teamet behover:
- Lagga till `"supplier_invoices"` i `validTypes`
- Vid GET: lasa fran `booking_supplier_invoices` where `booking_id = ?`
- Returnera cachat data med `invoice_data`, `linked_product_id`, `given_number`, `fetched_at`

### Steg 2: Uppdatera lokal proxy och service (nar Booking har lagt till stodet)
- Lagga till `fetchSupplierInvoices` i `planningApiService.ts`
- Skapa ett `SupplierInvoice`-interface som matchar Bookings svarformat
- Lagga till en query i `useProjectEconomy.tsx`

### Steg 3: Skapa `SupplierInvoicesCard`-komponent
En ny komponent i ekonomifliken som visar:
- Fakturanummer (GivenNumber)
- Leverantor (SupplierName)
- Fakturadatum / Forfallodatum
- Belopp (Total)
- Kopplad till (linked_product_id -- visa produktnamn)
- Attesterad / Ej attesterad
- "Uppdatera fran Fortnox"-knapp (triggar refresh)
- Total leverantorskostnader langst ner

### Steg 4: Integrera i EconomySummary
- Lagga till `supplierInvoicesTotal` i `EconomySummary`-typen
- Inkludera i totalberakningen som en del av "Utfall"

## Vad jag kan gora NU (utan att Booking andrar)
Eftersom Bookings `planning-api` inte exponerar supplier invoices an, finns tva vagar:

**Alt A** -- Forbered allt lokalt (interface, komponent, hook), men med data = tom array tills Booking uppdaterar. Plus skriva ett meddelande till Booking-teamet.

**Alt B** -- Anropa `fortnox-supplier-invoices` direkt fran proxyn (den kraver dock JWT-auth, inte API-key, och `bookingNumber` istallet for `booking_id`). Detta ar mer hacky.

## Teknisk plan (Alt A -- rekommenderat)

### Filer som skapas/andras
- `src/types/projectEconomy.ts` -- nytt `SupplierInvoice` interface
- `src/services/planningApiService.ts` -- ny `fetchSupplierInvoices(bookingId)`
- `src/hooks/useProjectEconomy.tsx` -- ny query + inkludera i summary
- `src/components/project/SupplierInvoicesCard.tsx` -- ny komponent (tabell, refresh, totalrad)
- `src/components/project/ProjectEconomyTab.tsx` -- rendera `SupplierInvoicesCard`
- `src/services/projectEconomyService.ts` -- `calculateEconomySummary` inkluderar supplier invoices total
- `src/services/projectEconomyExportService.ts` -- exportformat

### SupplierInvoice interface (matchar Bookings cachade data)
```text
interface SupplierInvoice {
  id: string;
  booking_id: string;
  given_number: string;
  invoice_data: {
    GivenNumber: string;
    SupplierName: string;
    InvoiceDate: string;
    DueDate: string;
    Total: number;
    Balance: number;
    Currency: string;
    YourReference: string;
    // ... fler Fortnox-falt
  };
  linked_product_id: string | null;
  fetched_at: string;
}
```

