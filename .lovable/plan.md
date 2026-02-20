
# Professionell visning av leverantörsfakturastatus i kostnadslistor

## Sammanfattning
Byt namn pa kolumnen "Fakturerat" till **"Lev.faktura"** (Leverantorsfaktura) i bade PurchasesList och ProductCostsCard. Forbattra presentationen sa att den tydligt visar:
- Faktiskt fakturabelopp fran kopplad leverantorsfaktura
- Avvikelse mot budgeterad kostnad (gron = under budget, rod = over)
- Slutgiltig-markering om checkboxen ar ikryssad pa fakturan
- Om ingen faktura ar kopplad: diskret streck

Inga andringar gors i SupplierInvoicesCard -- den behaller sin kopplingslogik som den ar.

## Andringar

### 1. PurchasesList.tsx
- Byt kolumnrubriken "Fakturerat" till **"Lev.faktura"**
- Behall befintlig logik som visar kopplad fakturadata (den ar redan korrekt implementerad)
- Uppdatera TOTALT-raden sa att colSpan stammer

### 2. ProductCostsCard.tsx
- Byt kolumnrubriken "Fakturerat" till **"Lev.faktura"**
- Behall befintlig logik for `getLinkedInvoiceInfo` och visning i rader

## Tekniska detaljer
Andringarna ar minimala -- enbart en textandring pa tva stallen:
- `PurchasesList.tsx` rad 77: `Fakturerat` -> `Lev.faktura`
- `ProductCostsCard.tsx` rad 257: `Fakturerat` -> `Lev.faktura`
