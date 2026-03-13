

# Refaktorering: Förenklat faktureringsflöde (3 statusar)

## Sammanfattning

Hela faktureringslogiken förenklas från 8 statusar till 3: `draft`, `ready`, `invoiced`. All betalnings-, förfallo- och kreditlogik tas bort. Systemet hanterar enbart fakturaunderlag och skapande av faktura i Fortnox.

## Databasändring

DB-enum `billing_status` behöver uppdateras. Befintliga poster mappas:
- `not_ready`, `under_review` -> `draft`
- `ready_to_invoice`, `invoice_created` -> `ready`
- `invoiced`, `partially_paid`, `paid`, `overdue` -> `invoiced`

Migration:
1. Uppdatera befintliga rader till nya värden
2. Skapa ny enum med bara `draft`, `ready`, `invoiced`
3. Ändra kolumnen till nya enumen
4. Kolumnerna `invoice_paid_at`, `invoice_sent_at`, `due_date` behålls i schemat (de finns redan, ingen skada att låta dem ligga kvar) men ignoreras i koden

## Filändringar

### `src/hooks/useProjectBilling.ts`
- `BillingStatus` = `'draft' | 'ready' | 'invoiced'`
- Ta bort `partially_paid`, `paid`, `overdue`, `not_ready`, `under_review`, `ready_to_invoice`, `invoice_created`
- `groupByBillingStatus` -> enkel gruppering med 3 nycklar, ingen overdue-logik
- `useAdvanceBillingStatus`: ta bort paid/sent timestamps, behåll bara `approved_for_invoicing_at` för `ready`
- `useCreateProjectBilling`: sätt `billing_status: 'draft'`
- Ta bort `invoice_paid_at`, `invoice_sent_at`, `due_date` från `ProjectBilling` interface (de finns i DB men behövs inte i koden)

### `src/components/economy/billing/BillingStatusBadge.tsx`
- 3 statusar: Draft ("Utkast"), Ready ("Redo att fakturera"), Invoiced ("Fakturerad")

### `src/components/economy/billing/BillingKpiCards.tsx`
- 4 KPI:er: Att granska (draft), Redo att fakturera (ready), Fakturerat denna månad (invoiced senaste 30d), Ofakturerat värde (draft+ready)
- Ta bort "Skickat obetalt", "Förfallet", "Inbetalt"

### `src/components/economy/billing/BillingSection.tsx`
- 4 tabs: Alla, Utkast, Redo, Fakturerade
- Ta bort "Förfallen", "Betald", "Skapad", overdue-logik
- Ta bort due_date-kolumn i tabellen
- Ta bort paidThisMonth, sentUnpaid, overdueIds
- Förenkla QuickActions: draft->ready, ready->invoiced (via Fortnox)
- Förenkla prioritetslogik

### `src/components/economy/billing/BillingReviewDialog.tsx`
- Ta bort "Markera som betald"-knapp och canMarkPaid-logik
- Ta bort "Fakturerad"-knapp (ersätts av Fortnox-integration)
- Ta bort "Betalning mottagen" från historik-tidslinjen
- Förenkla actions: Spara, Komplettering, Godkänn (draft->ready), Skapa faktura i Fortnox (ready->invoiced)
- "Skapa faktura" ska använda befintliga `useCreateFortnoxInvoice` hooken och uppdatera status till `invoiced` med `external_invoice_id` och `invoice_number`
- Ta bort due_date och Förfallodatum från Kund & Faktura-fliken

### `src/hooks/useBillingInvoiceData.ts`
- Ingen ändring behövs (hanterar redan enbart underlagsdata)

