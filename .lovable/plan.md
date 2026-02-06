
# Fix: Produkthierarki i bade desktop- och mobilvy

## Problem
Tva buggar i produktvisningen:

1. **Paketmedlemmar ignoreras**: Koden i desktop-vyn (`ProductsList.tsx`) kollar bara `parentProductId` for att avgora om en produkt ar ett barn. Den ignorerar `isPackageComponent` och `parentPackageId` helt -- sa paketmedlemmar visas som separata foraldraprodukter istallet for under sitt paket.

2. **Duplicering och felaktig ordning**: Fragan `booking_products (*)` i Supabase har **ingen ORDER-klausul**, vilket innebar att barn kan hamna FORE sin foraldraprodukt i listan. Grupperingslogiken gar igenom listan sekventiellt och skapar darigenom felaktiga grupperingar nar ordningen ar oforutsagbar.

## Losning

### 1. Desktop: `ProductsList.tsx` -- Uppdatera grupperingslogik
- Byt namn pa `isAccessory` till `isChildProduct` 
- Lagg till kontroll av `isPackageComponent` och `parentPackageId` (inte bara `parentProductId`)
- Uppdatera `groupProducts` att bygga sin barn-map med bade `parentProductId` OCH `parentPackageId`
- Rensa visningsnamn fran prefix-tecken (`↳`, `└`, `L,`, `⦿`)
- Behall collapsible-granssnitt som idag

### 2. Desktop: `bookingFetchService.ts` -- Lagg till ORDER-klausul
- Andra `booking_products (*)` till att ordna produkterna sa att foraldrar alltid kommer fore sina barn
- Anvand ordning som garanterar korrekt sekventiell gruppering: foraldrar forst (de utan `parent_product_id`), sedan barn

### 3. Mobil: `JobInfoTab.tsx` -- Synka med desktop-logiken
- Mobilkoden har redan ratt faltkontroller (`parent_product_id`, `parent_package_id`, `is_package_component`) men samma grupperingsproblem
- Sakerstall att barn som inte hittar sin foralder via ID visas under narmaste foregaende foralder istallet for att forsvinna
- Aterstand: produktnamn rensas redan korrekt i mobilversionen

### 4. Edge Function: `mobile-app-api` -- Ordna produkter
- Lagg till `.order('parent_product_id', { ascending: true, nullsFirst: true })` i produktfragan
- Sakerstaller att foraldraprodukter (med null parent_product_id) kommer fore sina barn

## Tekniska detaljer

### Ny `isChildProduct`-logik (bada vyerna):

```text
isChildProduct(product):
  1. Om parent_product_id finns -> ar barn
  2. Om parent_package_id finns -> ar barn
  3. Om is_package_component = true -> ar barn
  4. Fallback: kontrollera namnprefix (for legacy-data)
```

### Ny `groupProducts`-logik:

```text
1. Bygg barn-map: parent_product_id -> [barn]
2. Bygg barn-map: parent_package_id -> [barn]
3. Slå ihop bada mapparna
4. Iterera produkter sekventiellt:
   - Foralder: spara foregaende grupp, starta ny
   - Barn utan ID-koppling: lagg under foregaende foralder
5. For varje grupp: slå ihop ID-barn och sekventiella barn (deduplicera)
```

### Filer som andras:

| Fil | Andringar |
|-----|-----------|
| `src/components/booking/ProductsList.tsx` | `isAccessory` -> `isChildProduct`, lagg till `parentPackageId`/`isPackageComponent`-kontroll, rensa produktnamn |
| `src/services/booking/bookingFetchService.ts` | Ordna `booking_products` i fragan |
| `src/components/mobile-app/job-tabs/JobInfoTab.tsx` | Fixa orphaned children-bugg, synka logik |
| `supabase/functions/mobile-app-api/index.ts` | Ordna produkter i `handleGetBookingDetails` |

## Resultat
Bade desktop- och mobilvy visar produkter i korrekt hierarki: paketmedlemmar OCH tillbehor grupperade under sina foraldraprodukter, med rensade namn och utan duplicering.
