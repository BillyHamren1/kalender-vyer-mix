

# Fix: Produkthierarki i mobilappens jobbvy

## Problem
Produktlistan i jobbdetaljen visar alla produkter platt med raa prefix-tecken (som "↳") istallet for att gruppera tillbehor under sina foraldraprodukter. Tva saker saknas:

1. **API:et hamtar inte hierarki-falt** -- `parent_product_id`, `parent_package_id` och `is_package_component` saknas i fragan
2. **Ingen grupperingslogik i UI:t** -- produkterna renderas som en enkel lista utan indrag eller hopfallning

## Losning

### 1. Edge Function: Utoka produktfragan
**Fil:** `supabase/functions/mobile-app-api/index.ts`

Andra produktfragan i `handleGetBookingDetails` fran:
```text
.select('id, name, quantity, notes')
```
till:
```text
.select('id, name, quantity, notes, parent_product_id, parent_package_id, is_package_component')
```

### 2. JobInfoTab: Lagg till produktgruppering
**Fil:** `src/components/mobile-app/job-tabs/JobInfoTab.tsx`

- Lagg till `isAccessory()`-hjalp som kollar `parent_product_id` och namnprefix (samma logik som desktop-systemets `ProductsList.tsx`)
- Lagg till `groupProducts()` som grupperar tillbehor under foraldraprodukter
- Rensa bort prefix-tecken fran visningsnamn (ta bort inledande `↳`, `└`, `L,`)
- Foraldraprodukter visas i fetstil med ett badge som visar antal tillbehor
- Tillbehor visas indenterade under sin foralder med en liten pil-ikon
- Hela gruppen ar hopfallbar (klick pa foraldern toglar tillbehoren)

### Visuellt resultat

```text
PRODUKTER

Multiflex 6x27 (#2)              1 st   [3 tillbehor v]
  ↳ M Takduk 6 meter - Vit      18 st
  ↳ M Gaveltriangel 6m           4 st
  ↳ Kassetgolv 6x27              1 st

Multiflex 6x27 (#1)              1 st   [1 tillbehor v]
  ↳ Nalfiltsmatta - Bordeaux     1 st
```

Istallet for den platta listan med raa prefix-tecken som visas nu.

## Tekniska detaljer

- Exakt samma grupperingslogik som `src/components/booking/ProductsList.tsx` anvander redan -- ateranvands for konsistens
- `cleanProductName()`-funktion tar bort prefix som `↳ `, `└ `, `L,` fran namn for att undvika dubbla pilar
- Tillbehor ar hopfallda som standard for att halla listan kompakt
- Inga nya beroenden behovs

