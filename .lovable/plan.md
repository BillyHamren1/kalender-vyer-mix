

# Fakturagranskningspanel — Fullständig ombyggnad

## Nuläge

Den befintliga `BillingReviewPanel` är en enkel sidopanel (Sheet, 540px bred) med grundläggande info, en kort checklista, interna anteckningar och statusåtgärder. Den saknar:

- Detaljerat fakturaunderlag (timmar, material, transport, tillägg, underleverantörer)
- Kund- och fakturainfo med validering
- Avvikelseanalys med automatiska varningar
- Faktureringshistorik / tidslinje
- Utökad checklista (9 punkter istället för 6)
- Ekonomisk sammanfattning med moms, rabatter, tillägg

## Arkitektur

Ersätt den nuvarande Sheet-baserade panelen med en **fullskärmsvy** som öppnas via en Dialog (max-w-5xl) eller som en dedikerad route. En Dialog är bättre för att bevara kontext i ekonomiöversikten.

```text
BillingReviewDialog (Dialog, max-w-5xl)
├── Header: projektinfo + statusbadgar + actions
├── Tab 1: Sammanfattning
│   ├── EconomySummaryCards (offert, fakturerbart, marginal)
│   └── AvvikelseIndikator
├── Tab 2: Fakturaunderlag
│   ├── TimmarBlock
│   ├── MaterialBlock
│   ├── TransportBlock
│   ├── TilläggBlock
│   └── UnderleverantörerBlock
├── Tab 3: Kund & Faktura
│   ├── KundInfo (med varningar för saknade fält)
│   └── FakturaInfo (referens, betalvillkor, moms)
├── Tab 4: Granskning
│   ├── Checklista (9 punkter)
│   ├── InternaAnteckningar
│   └── Avvikelser & Varningar
└── Sidebar/Footer: Historik-tidslinje
```

## Databas

Inga nya tabeller behövs. `project_billing`-tabellen har redan alla nödvändiga fält. Checklist-strukturen utökas med fler nycklar i JSONB (`review_checklist`).

Befintliga fält som redan stöder framtida integration:
- `external_invoice_id`, `invoice_number`, `invoice_date`, `due_date`
- `invoice_sent_at`, `invoice_paid_at`, `review_completed_at`, `approved_for_invoicing_at`
- `internal_notes`, `review_checklist` (JSONB)

## Datahämtning för fakturaunderlag

Fakturaunderlagets detaljer (timmar, material, transport) hämtas från befintliga tabeller baserat på `booking_id` och `project_id`:

- **Timmar**: `time_reports` (lokala) via befintliga hooks
- **Material/produkter**: `booking_products` via `booking_id`
- **Transport/inköp**: `project_purchases` / `packing_purchases` beroende på `project_type`
- **Underleverantörer**: `planning-api-proxy` (supplier invoices) via befintlig ekonomihook

En ny hook `useBillingInvoiceData(billing)` samlar all data.

## Implementeringsplan

### 1. Skapa `useBillingInvoiceData` hook
Hook som tar en `ProjectBilling` och hämtar alla underlagsposter (timmar, material, transport, tillägg, underleverantörer) från respektive datakällor.

### 2. Ersätt `BillingReviewPanel` med `BillingReviewDialog`
Fullständig dialog med header, tabs och alla 8 sektioner enligt specifikationen. Byggd som en stor komponent med interna subkomponenter.

### 3. Utökad checklista
Lägg till 3 nya kontrollpunkter:
- `invoice_info_complete` — Fakturauppgifter kompletta
- `internal_note_added` — Intern notering tillagd vid behov
- `ready_for_invoicing` — Projekt klart för fakturering

### 4. Historik-tidslinje
Renderar timestamps från `project_billing`-fälten (`closed_at`, `review_completed_at`, `approved_for_invoicing_at`, `invoice_sent_at`, `invoice_paid_at`) som en vertikal tidslinje.

### 5. Automatiska varningar
Beräknas från data: saknade timmar, material, kunduppgifter, 0-belopp, avvikelse >10%, saknat stängningsdatum, ej genomförd internkontroll.

### 6. Uppdatera `BillingSection` och `BillingPipeline`
Byt referens från `BillingReviewPanel` till `BillingReviewDialog`.

## Statuslogik

Behåller befintlig `useAdvanceBillingStatus` med förstärkt validering:
- `under_review` → `ready_to_invoice`: kräver alla checklist-bockar
- `ready_to_invoice` → `invoice_created`: kräver kunduppgifter
- `invoice_created` → `invoiced`: kräver fakturanummer
- `invoiced` → `paid`: sätter `invoice_paid_at`
- Automatisk `overdue` beräknas redan i `groupByBillingStatus`

Bakåtsteg (`needs_completion`) tillåts bara från `under_review`.

## Designprinciper

- Tabs istället för lång scroll — snabb navigering
- Sammanfattning alltid synlig i header
- Varningar visas som diskreta amber-badges, inte aggressivt rött
- Konsekvent med befintlig ekonomiöversiktens typografi och spacing
- Actions alltid synliga i header, inte gömd längst ner

## Filer som skapas/ändras

| Fil | Åtgärd |
|-----|--------|
| `src/hooks/useBillingInvoiceData.ts` | Ny |
| `src/components/economy/billing/BillingReviewDialog.tsx` | Ny (ersätter Panel) |
| `src/components/economy/billing/BillingSection.tsx` | Uppdatera import |
| `src/components/economy/billing/BillingReviewPanel.tsx` | Ta bort |
| `src/hooks/useProjectBilling.ts` | Utöka `ReviewChecklist` |

