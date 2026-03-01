

## Analys: Varför export-economy-data returnerar tomma resultat

### Problem 1: Fel endpoint för externa API-anrop (time_reports, product_costs, supplier_invoices)

I `export-economy-data/index.ts` rad 91 anropas:
```
${efUrl}/functions/v1/planning-api-proxy
```
Men `planning-api-proxy` finns bara lokalt — på det externa systemet heter endpointen `planning-api`. Jämför med `planning-api-proxy/index.ts` rad 15 som korrekt anropar:
```
${efUrl}/functions/v1/planning-api
```

Detta gör att **alla externa anrop** (time_reports, supplier_invoices, product_costs) misslyckas tyst (catch returnerar null/tom array).

**Fix**: Ändra rad 91 i `export-economy-data/index.ts` från `planning-api-proxy` till `planning-api`.

### Problem 2: Lokala tabeller är tomma (förväntat)

Dessa tabeller har **verkligen 0 rader** i databasen:
- `project_invoices`, `packing_invoices` → 0
- `project_quotes`, `packing_quotes` → 0  
- `project_budget`, `packing_budget`, `large_project_budget` → 0
- `project_labor_costs`, `packing_labor_costs` → 0

Bara `project_purchases` har 6 rader (matchar det Hubben ser).

Ekonomidata för enskilda bokningar hämtas normalt via det **externa** planning-api (budget, quotes, invoices per booking). Men `export-economy-data` försöker hämta dessa från **lokala** tabeller istället — som bara innehåller manuellt skapade lokala poster.

**Fix**: Hämta budget, quotes och invoices per booking från externa API:t (precis som time_reports/product_costs/supplier_invoices redan gör), som fallback/komplement till lokala tabeller.

### Ändringar

| Fil | Ändring |
|---|---|
| `supabase/functions/export-economy-data/index.ts` | 1. Fix endpoint `planning-api-proxy` → `planning-api` |
| | 2. Lägg till externa API-anrop för budgets, quotes, invoices per booking |
| | 3. Merga externa + lokala resultat för komplett bild |

### Teknisk approach

```text
fetchExternal() → fix URL till planning-api

BUDGETS:   lokala project_budget + externa budget per booking
QUOTES:    lokala project_quotes + externa quotes per booking  
INVOICES:  lokala project_invoices + externa invoices per booking
```

Varje scope behåller sin nuvarande lokala query men kompletteras med per-booking externa anrop via samma `fetchExternal()` helper. Resultatet mergas i response-objektet.

