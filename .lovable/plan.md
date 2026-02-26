

## Ny widget: Budget vs Utfall per kostnadstyp

### Bakgrund
Produktkostnadstabellen visar idag bara budgetvärden (Montage, Lagerkostnad, Inköp). Användaren vill ha en separat jämförelsewidget som ställer budgeterade kostnader per typ mot faktiska utfall.

### Datakällor

**Budget** (redan tillgänglig via `productCosts`):
- Montagekostnad: `assembly_cost * quantity` per produkt
- Lagerkostnad: `handling_cost * quantity` per produkt
- Inköpskostnad: `purchase_cost * quantity` per produkt

**Utfall** (tillgänglig data):
- **Tidrapporter** (`timeReports`): faktiska personalkostnader (timmar × timpris) — kan representera utfall för montagekostnad
- **Leverantörsfakturor** (`supplierInvoices`): faktiska fakturerade belopp som redan kan vara länkade till produkter via `linked_cost_type` och `linked_cost_id` — representerar utfall för inköpskostnad
- **Inköp** (`purchases`): registrerade inköp — kan representera ytterligare utfall

### Implementation

**1. Ny komponent: `CostComparisonCard.tsx`**
- Tar emot `productCosts`, `timeReports`, `supplierInvoices`, `purchases` som props
- Visar en tabell med tre rader: Montagekostnad, Lagerkostnad, Inköpskostnad
- Kolumner: **Kostnadstyp | Budget | Utfall | Avvikelse | %**
- Använder befintlig färgkodning (`getDeviationStatus`/`getDeviationColor`) för avvikelser
- Summarad längst ner

**Beräkningslogik:**
- Montage budget = `Σ (assembly_cost × quantity)` — utfall = total tidrapporterad kostnad (`staffActual`)
- Lager budget = `Σ (handling_cost × quantity)` — utfall = 0 tills det finns en mekanism att rapportera detta
- Inköp budget = `Σ (purchase_cost × quantity)` — utfall = summa länkade leverantörsfakturor + registrerade inköp

**2. Integrera i `ProjectEconomyTab.tsx`**
- Placera nya widgeten direkt under `ProductCostsCard`
- Skicka nödvändig data som props

### Tekniska detaljer
- Ingen databasändring krävs — all data finns redan tillgänglig
- Återanvänder befintliga typer (`ProductCostSummary`, `StaffTimeReport`, `SupplierInvoice`, `ProjectPurchase`)
- Återanvänder `getDeviationStatus`/`getDeviationColor` för konsekvent färgkodning
- Formatering med befintlig `fmt()`-funktion (sv-SE locale)

