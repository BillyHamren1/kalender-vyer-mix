

## Analys: Var kommer 308 455 kr ifrån?

Summan kommer från **produktkostnader** (`product_costs.summary.costs`) som hämtas från de länkade bokningarna via planning-API:et. Detta är den totala självkostnaden på produkterna i bokningarna (material, arbete, externa kostnader etc.) — inte inköp, fakturor eller personal.

### Problemet

Formeln för `grandTotalCost` i `useLargeProjectEconomy.tsx` (rad 142-148) summerar:

```text
grandTotalCost = localPurchasesTotal      ← projektinköp (0 kr)
               + agg.totalCost            ← produktkostnad från bokningar (308 455 kr?)
               + agg.totalStaffCost       ← personalkostnad (0 kr)
               + agg.totalPurchases       ← bokningsinköp (0 kr)
               + agg.totalInvoices        ← fakturor (0 kr)
               + agg.totalSupplierInvoices ← leverantörsfakturor (0 kr)
```

Produktkostnaden syns i kortet "Ekonomi från bokningar" → "Produktkostnad", men det framgar inte tydligt att det ar den som driver totalbeloppet.

### Foreslagna forbattringar

1. **Tydligare kostnadsuppdelning i summary-kortet "Total kostnad"**
   - Visa en tooltip eller expanderbar breakdown under totalbeloppet som listar varje delpost (produktkostnad, personal, inköp, fakturor, leverantörsfakturor).

2. **Gör "Total kostnad"-kortet klickbart/expanderbart**
   - Vid klick/hover visas en mini-lista med alla delkostnader och deras belopp, så att användaren direkt ser vad som ingår.

3. **Markera 0-poster som inaktiva**
   - I "Ekonomi från bokningar"-sektionen, visa poster med 0 kr i en dämpad stil så att den post som faktiskt har ett värde (produktkostnad) sticker ut.

### Tekniska ändringar

- **Fil**: `src/pages/project/LargeProjectEconomyPage.tsx`
  - Under "Total kostnad"-kortet: lägg till en kompakt breakdown-lista med alla kostnadskategorier och deras belopp
  - Eventuellt som en expanderbar sektion eller tooltip

- **Inga beräkningsändringar** — formeln är korrekt, men transparensen behöver förbättras i UI:t.

