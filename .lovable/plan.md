# Fix: Första bokstaven försvinner + tillbehör visas inte i bokningsvyn

Båda buggarna sitter i `src/components/project/ProjectProductsList.tsx`.

## Bugg 1 — Första bokstaven på vissa rader försvinner

`cleanName` använder en teckenklass som råkar innehålla bokstaven `L`:

```ts
name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();
```

`[L,]` betyder "vilket som helst av `L` eller `,`", så varje produktnamn som börjar på `L` får sin första bokstav strippad. "Ljusslinga …" → "jusslinga …", "Lätt lastbil" → "ätt lastbil".

**Fix:** byt till alternation så endast den exakta prefix-strängen `L,` (tillbehörsmarkör i importen) tas bort, inte ett ensamt `L`:

```ts
const cleanName = (name: string) =>
  name.replace(/^(?:L,|[↳└→✓\u21B3\u2514\u2192\u2713\-–\s])+\s*/, "").trim();
```

## Bugg 2 — Inga tillbehör visas

Importen lagrar alla barnrader med `is_package_component = true`, men det finns två typer som skiljs åt på prefixet i `name`:

- `"-- ..."` = paketkomponenter (alltid med i paketet, ska döljas).
- `"↳ ..."` = tillbehör som kunden själv lagt till (ska visas under huvudprodukten).

Nuvarande filter i `renderProductLine` döljer alla rader med `is_package_component === true`, så även `↳`-tillbehören försvinner:

```ts
const accessories = allChildren.filter(
  (c) => c.parent_product_id === product.id && c.is_package_component !== true
);
```

**Fix:** klassa raden på namn-prefix istället för enbart flaggan. En rad räknas som synligt tillbehör om den har en parent och namnet börjar med `↳` (eller, för säkerhets skull, andra arrow/accessory-markörer som `└`, `→`). `-- `-rader (rena paketkomponenter) fortsätter att döljas.

Samma justering görs på de andra ställen i filen som speglar `allChildren`-filtret (t.ex. `visibleProducts`-summeringen för vikt/volym), så att `↳`-tillbehören räknas in i vikt-/volym-summan på samma sätt som de visas.

### Tekniska detaljer

I `ProjectProductsList.tsx`:

1. Lägg till hjälpare:
   ```ts
   const isHiddenPackageComponent = (name: string) =>
     /^\s*--/.test(name); // "-- P Ben" etc
   const isVisibleAccessory = (p: BookingProduct) =>
     !!p.parent_product_id && !isHiddenPackageComponent(p.name);
   ```
2. Ersätt accessory-filtret i `renderProductLine` med `isVisibleAccessory(c) && c.parent_product_id === product.id`.
3. Ersätt `visibleProducts`-filtret med `products.filter(p => !p.parent_product_id || isVisibleAccessory(p))`.
4. Lämna `mainProducts` orört (parent_product_id null & is_package_component false).

## Verifiering

- Visuell kontroll i preview på bokning 2605-56 (Westers Catering, eventdate 2026-06-05):
  - "Ljusslinga - Pris per lpm" och "Lätt lastbil" visas med rätt namn.
  - Under "Multiflex 6x9" (och "P 4x4") syns nu `↳ Takduk, vit 4x4`, `↳ Vägg, transparent 4x4`, `↳ Vägg, täck 4x4` osv som tillbehör.
  - `-- P Ben`, `-- P Hatt` osv visas fortfarande inte.
- Snabbt enhetstest för `cleanName` + accessory-klassificering (vitest) som låser att "Ljusslinga" och "Lätt lastbil" inte trimmas, och att `↳`-rader klassas som synliga tillbehör medan `--`-rader inte gör det.

## Inte i scope

- Inga ändringar i DB-data eller importflödet.
- `JobDetail.tsx` (`isAccessory`/`groupProducts`) och `PackingListTab.tsx` rör jag inte — de använder andra prefix-regler och syns inte i den rapporterade vyn.
