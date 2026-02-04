
## Mål
I scanner-vyn (/scanner) ska endast huvud-/paketrader visas i VERSALER. Medlemmar/underartiklar (tillbehör + paketkomponenter) ska visas i normal text (inte versaler), samtidigt som packlistans flöde och räkning (t.ex. 2/3) fortsätter fungera.

## Varför det fortfarande blir versaler
I `src/components/scanner/VerificationView.tsx` avgörs “child” just nu med:
- `name.startsWith('↳') || name.startsWith('└') || name.startsWith('L,')`

Det faller i praktiken ofta på:
- inledande mellanslag/indentering i strängen (t.ex. `"  └ ..."`)
- andra prefix som förekommer i systemet (t.ex. `⦿`)
- eller att hierarkin egentligen bör avgöras via databashierarki (`parent_product_id`, `parent_package_id`, `is_package_component`) istället för textprefix.

När `isChild` blir `false` triggas `name.toUpperCase()` och då blir allt versaler.

## Lösningsidé (robust och konsekvent med övriga packlistan)
1) Sluta lita på prefix i texten för hierarki (eller använd det bara som fallback).
2) Avgör child/top-level primärt via fälten på `booking_products`:
   - `parent_product_id`
   - `parent_package_id`
   - `is_package_component`
3) Rensa prefixsymboler från visningsnamnet (som ni redan gör på andra ställen i warehouse-UI) och rendera indikator (↳/⦿) separat i UI.
4) Casing-regler:
   - Top-level: VERSALER
   - Child: “normal” (inte versaler). Om datat kommer in som HELT versaler kan vi konvertera till läsbar form (Title Case) med enkel heuristik som bevarar korta förkortningar som “LM”, “M”, samt mått/nummer.

## Steg-för-steg ändringar (kod)
### 1) Utöka datan som hämtas för packlist-items (för korrekt hierarki)
**Fil:** `src/services/scannerService.ts`  
**Ändring:** I `fetchPackingListItems()` uppdatera select så att `booking_products` även hämtar:
- `parent_product_id` (finns redan)
- `parent_package_id`
- `is_package_component`

Det gör att scanner-vyn kan avgöra child korrekt utan att gissa via text.

### 2) Uppdatera typer i VerificationView för de nya fälten
**Fil:** `src/components/scanner/VerificationView.tsx`  
**Ändring:** I `PackingItem`-interfacet, lägg till i `booking_products`:
- `parent_product_id?: string | null`
- `parent_package_id?: string | null`
- `is_package_component?: boolean | null`

### 3) Bygg en robust “är child?”-check
**Fil:** `src/components/scanner/VerificationView.tsx`  
**Ändring:** Ersätt nuvarande `isChild` med något i stil med:
- `const rawName = item.booking_products?.name ?? ''`
- `const trimmedForPrefix = rawName.trimStart()`
- `const isChildByRelation = !!item.booking_products?.parent_product_id || !!item.booking_products?.parent_package_id || !!item.booking_products?.is_package_component`
- `const isChildByPrefix = trimmedForPrefix.startsWith('↳') || trimmedForPrefix.startsWith('└') || trimmedForPrefix.startsWith('L,') || trimmedForPrefix.startsWith('⦿')`
- `const isChild = isChildByRelation || isChildByPrefix`

Det här gör att medlemmar alltid identifieras korrekt (även om prefix varierar eller har mellanslag).

### 4) Rensa prefix i visningsnamn + rendera prefix som UI-indikator
**Fil:** `src/components/scanner/VerificationView.tsx`  
Inför en lokal `cleanName()` (samma princip som i t.ex. `ProductCostsCard` / `PackingListItemRow`):
- `const clean = rawName.replace(/^[↳└⦿\s,L]+/, '').trim()`

Och rendera sedan t.ex.:
- om `isChild`: visa en liten `↳` (eller `⦿` om `is_package_component`/prefix `⦿`) före namnet via `<span>` i UI
- själva namnet utan de här symbolerna

Det gör listan mindre “stökig” och mer som resten av packlistan.

### 5) Fix för casing (endast huvudrad i versaler)
**Fil:** `src/components/scanner/VerificationView.tsx`  
- Top-level: `clean.toUpperCase()`
- Child: visa `clean` i normal/läsbar form.

För att hantera att child-namn kan vara importerade i HELA versaler, lägg in en hjälpfunktion `formatChildDisplayName(clean)` som:
- om texten redan är blandad (inte “mostly uppercase”) → returnera som den är
- annars → Title Case per ord, men behåll:
  - ord som är korta förkortningar (t.ex. 1–3 tecken) i originalversaler (LM, M)
  - ord som innehåller siffror/mått (t.ex. 8X15) i originalformat

Resultat: `└ NÅLFILTSMATTA - BORDEAUX` blir t.ex. `↳ Nålfiltsmatta - Bordeaux` och “LM” förblir “LM”.

### 6) Snabb visuell förbättring så listan känns “packlista”, inte ful
(utan att ändra funktion)
**Fil:** `src/components/scanner/VerificationView.tsx`
- Behåll 0/1, 2/3 etc (redan återinfört)
- Justera typografi så child inte ser “skrikig” ut:
  - child: `text-xs text-muted-foreground font-normal normal-case`
  - main: `text-sm font-semibold tracking-wide` (och uppercase via data eller class)
- Se till att indikatorn (↳/⦿) är diskret (muted-foreground)

## Testplan (acceptanskriterier)
1) Öppna `/scanner` → välj/öppna en packlista med både huvudprodukter och medlemmar.
2) Verifiera att:
   - huvudrader är i versaler
   - alla underartiklar/medlemmar inte är i versaler
   - 0/1, 2/3 etc syns per rad och uppdateras vid skanning/klick
   - rader som är klara fortsätter vara disabled och markeras grönt
3) Skanna en SKU som tillhör en underartikel och säkerställ att rätt rad uppdateras och att progress (badge + procent) uppdateras.

## Filer som kommer ändras
- `src/services/scannerService.ts` (select: hämta hierarchy-fält)
- `src/components/scanner/VerificationView.tsx` (hierarki-detektering + cleanName + casing + liten UI-justering)

## Risker / Edge cases
- Om vissa äldre data saknar `parent_*` men har prefix i texten: fallback via `trimStart()` + prefix-check täcker det.
- Om vissa child-namn måste förbli exakta (specialförkortningar): heuristiken bevarar korta förkortningar och siffertokens.
