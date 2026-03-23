

## Ombyggnad: Ekonomisidan i Planning -- Projektledarens arbetsyta

10 steg som bygger vidare på befintlig kod. Ingen Fortnox-exekvering i Planning, ingen dubblering av masterdata, tydlig separation mellan atteststatus, syncstatus och billing/handover-status.

---

### Steg 1: Databas -- Tunn attesttabell + handover-fält

**Migration**: Skapa `supplier_invoice_attestations` och utöka `project_billing`.

```sql
-- Tunnt attestlager -- bara workflow, inte masterdata
CREATE TABLE public.supplier_invoice_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT get_user_organization_id(auth.uid()),
  booking_id TEXT NOT NULL,
  supplier_invoice_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'imported',  
  -- imported | needs_review | linked | attested | sent_to_booking | rejected
  attested_at TIMESTAMPTZ,
  attested_by TEXT,
  attest_comment TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  reject_reason TEXT,
  booking_sync_status TEXT DEFAULT 'pending',  
  -- pending | sent | confirmed | failed
  sent_to_booking_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_invoice_id, organization_id)
);

ALTER TABLE public.supplier_invoice_attestations ENABLE ROW LEVEL SECURITY;
-- Standard org RLS policy

-- Handover-fält på project_billing
ALTER TABLE public.project_billing
  ADD COLUMN IF NOT EXISTS handover_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS handed_over_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handed_over_by TEXT,
  ADD COLUMN IF NOT EXISTS handover_notes TEXT;
```

Inget duplicerat invoice-belopp/leverantör/datum -- det hämtas från befintlig supplier invoice-källa vid rendering.

---

### Steg 2: Uppdatera BillingStatus-modell

**Fil**: `src/hooks/useProjectBilling.ts`

- Ändra `BillingStatus` till: `'draft' | 'needs_completion' | 'ready_for_handover' | 'handed_over_to_booking' | 'invoiced_in_booking'`
- Uppdatera `groupByBillingStatus` med alla 5 statusar
- Uppdatera `useAdvanceBillingStatus` med nya timestamp-fält för handover
- Behåll `ReviewChecklist` och `ReviewStatus` som de är

**Fil**: `src/components/economy/billing/BillingStatusBadge.tsx`

- Uppdatera `STATUS_CONFIG` med 5 nya statusar och svenska labels:
  - draft → "Under granskning"
  - needs_completion → "Kräver komplettering"  
  - ready_for_handover → "Klar för överlämning"
  - handed_over_to_booking → "Överlämnad till ekonomi"
  - invoiced_in_booking → "Fakturerad"

**DB-migration**: Ändra billing_status enum/check till de nya värdena. Mappa: `ready` → `ready_for_handover`, `invoiced` → `invoiced_in_booking`.

---

### Steg 3: Ta bort Fortnox-knapp, bygg överlämningsflöde

**Fil**: `src/components/economy/billing/BillingReviewDialog.tsx`

- Ta bort `import { useCreateFortnoxInvoice }` och all Fortnox-logik (rad 37, 82, 147-185, 265-275)
- Ersätt "Godkänn"-knappen (rad 260-263) med "Godkänn för överlämning" som sätter `ready_for_handover`
- Uppdatera `HistoryTimeline` med ny kedja: Utkast → Granskning → Klar för överlämning → Överlämnad → Fakturerad

---

### Steg 4: Hook för attestflöde

**Ny fil**: `src/hooks/useSupplierInvoiceAttestation.ts`

- Läser attestposter från `supplier_invoice_attestations` via Supabase
- `ensureAttestRecords(bookingId, supplierInvoiceIds[])` -- idempotent upsert, anropas explicit (inte i render)
- Mutations:
  - `attestInvoice(invoiceId, comment?)` → status='attested', attested_at/by
  - `rejectInvoice(invoiceId, reason)` → status='rejected'
  - `linkInvoice(invoiceId)` → status='linked'
  - `pushAttestToBooking(invoiceId)` → anropar planning-api-proxy type='attest_supplier_invoice', uppdaterar booking_sync_status
- Exponerar aggregerade räknare: `unreviewed`, `unattested`, `totalUnattestedAmount`

---

### Steg 5: Bygg om SupplierInvoicesCard

**Fil**: `src/components/project/SupplierInvoicesCard.tsx` (fullständig omskrivning)

- Hämtar atteststatus via `useSupplierInvoiceAttestation`
- Grupperar fakturor efter atteststatus (nya, kopplade, attesterade, avvisade)
- Card-baserad layout istället för rå tabell
- Varje fakturakort visar: leverantör, belopp, datum, referens (från befintlig invoice_data), atteststatus-badge, syncstatus-badge
- Expanderbar detalj: kopplingsväljare, attestknapp, avvisknapp, kommentarsfält
- Visar marginalimpact per faktura

**Ny fil**: `src/components/economy/AttestStatusBadge.tsx`

- Badge-komponent för atteststatus (imported/needs_review/linked/attested/rejected/sent_to_booking)
- Separat syncstatus-indikator (pending/sent/confirmed/failed)

---

### Steg 6: Projektstängning med gates

**Ny fil**: `src/components/economy/ProjectClosureGate.tsx`

- Checklista med tydlig separation:
  - **Blockerande**: oattesterade leverantörsfakturor, nya ogranskade kostnader
  - **Varningar**: budgetavvikelse >10%, låg marginal, tidrapporter ej godkända
- Visuellt: grön/röd/gul per gate, blockerande gates disablar stängningsknappen
- Används i EconomyOverview (ersätter enkel AlertDialog) och i ProjectEconomyTab

---

### Steg 7: Förbättra ProjectEconomyTab

**Fil**: `src/components/project/ProjectEconomyTab.tsx`

- Lägg till sammanfattningskort överst: Intäkt | Total kostnad | TB/Marginal (3-kolumn grid)
- Åtgärdssektion: antal oattesterade fakturor, nya kostnader, stängningsstatus, överlämningsstatus
- Leverantörsfakturor-fliken använder ombyggda SupplierInvoicesCard
- ProjectClosureGate visas under sammanfattningen om projekt är nära stängning

---

### Steg 8: ProjectLeaderActionBoard + EconomyOverview

**Ny fil**: `src/components/economy/ProjectLeaderActionBoard.tsx`

Åtgärdsfokuserad vy som hämtar data från `useEconomyDashboard` + `supplier_invoice_attestations`:

1. Nya leverantörsfakturor (status='imported')
2. Oattesterade kostnader (status='linked')
3. Marginalvarning (>10% försämring)
4. Stängningsklara projekt
5. Blockerade från stängning
6. Överlämnade till Booking

Varje post: projektnamn, kund, antal åtgärder, belopp, snabbåtgärd.

**Fil**: `src/pages/EconomyOverview.tsx`

- Byt ordning: ActionBoard först, KPI-kort sekundärt (kompakt rad)
- Byt tab-label "Fakturering" → "Överlämning & status"
- Byt rubrik till "Projektekonomi"
- Projektstängningsdialogen använder ProjectClosureGate istället för enkel AlertDialog

---

### Steg 9: Push attest till Booking

**Fil**: `supabase/functions/planning-api-proxy/index.ts`

Ny type `'attest_supplier_invoice'`:
- Tar emot `{ supplier_invoice_id, booking_id, status, attested_by, attested_at, comment }`
- Gör PUT mot extern planning-api med attestdata
- Uppdaterar lokal `supplier_invoice_attestations.booking_sync_status` via serviceClient
- Returnerar sync-bekräftelse

---

### Steg 10: Polish BillingSection

**Fil**: `src/components/economy/billing/BillingSection.tsx`

- Rubrik: "Överlämning & fakturastatus"
- Tab-labels: "Under granskning", "Klar för överlämning", "Överlämnade", "Fakturerade"
- QuickActions: ta bort "Skapa faktura i Fortnox" (rad 387-390), ersätt med "Godkänn för överlämning"
- Uppdatera `getPriority`, `getWarnings`, `EMPTY_TEXTS` för nya statusar
- Uppdatera `BillingKpiCards`-props

---

### Filer som skapas
- `supabase/migrations/xxx_supplier_invoice_attestations.sql`
- `src/hooks/useSupplierInvoiceAttestation.ts`
- `src/components/economy/ProjectLeaderActionBoard.tsx`
- `src/components/economy/ProjectClosureGate.tsx`
- `src/components/economy/AttestStatusBadge.tsx`

### Filer som ändras
- `src/pages/EconomyOverview.tsx`
- `src/components/project/SupplierInvoicesCard.tsx`
- `src/components/project/ProjectEconomyTab.tsx`
- `src/components/economy/billing/BillingSection.tsx`
- `src/components/economy/billing/BillingReviewDialog.tsx`
- `src/components/economy/billing/BillingStatusBadge.tsx`
- `src/hooks/useProjectBilling.ts`
- `supabase/functions/planning-api-proxy/index.ts`
- `src/integrations/supabase/types.ts` (auto-uppdateras efter migration)

### Arkitektoniska garantier
- Atteststatus, syncstatus och billing/handover-status är alltid separata fält
- Ingen invoice-masterdata dupliceras lokalt (leverantör/belopp/datum kommer från supplier_invoice.invoice_data)
- Planning skapar aldrig Fortnox-fakturor
- planning-api-proxy är transport till Booking, inte ny master
- Blockerande gates ≠ varningar i closure-flödet

