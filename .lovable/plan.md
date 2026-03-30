

# Fix: Produktchecklista i aktivitetsdetaljer — hierarki och namnrensning

## Problem

1. **Saknade tillbehör**: Queryn i `EstablishmentTaskDetailSheet` hämtar bara produkter vars ID finns i `source_product_ids`. Men barn-produkter (tillbehör) som inte explicit valdes (t.ex. om bara föräldern valdes) hämtas aldrig.

2. **Felaktig hierarki**: Logiken i `productHierarchy` grupperar bara produkter som redan finns i det hämtade setet. Om en förälders tillbehör inte hämtades kan de aldrig visas.

3. **Orensade namn**: Produktnamn visas med rå prefix (`└`, `↳`, `-- K`, `⦿`) istället för att rensas med `cleanName()`.

## Lösning

### Fil: `EstablishmentTaskDetailSheet.tsx`

**1. Utöka produkthämtningen** — Efter att ha hämtat produkterna i `source_product_ids`, gör en andra query för att hämta **alla barn** vars `parent_product_id` pekar på någon av de hämtade produkterna. Detta säkerställer att alla tillbehör visas oavsett om de explicit valdes.

```
Query 1: SELECT * FROM booking_products WHERE id IN (source_product_ids)
Query 2: SELECT * FROM booking_products WHERE parent_product_id IN (hämtade parent-IDs)
Merge: Kombinera och deduplicera
```

**2. Stärk hierarki-logiken** — Uppdatera `productHierarchy` useMemo:
- Identifiera föräldrar: produkter utan `parent_product_id`, eller vars `parent_product_id` inte finns i setet
- Identifiera barn: produkter med `parent_product_id` som pekar på en produkt i setet
- Filtrera bort `is_package_component: true` (interna paketkomponenter ska döljas per befintlig konvention)
- Tillbehör (`is_package_component: false` med `parent_product_id`) visas under sin förälder

**3. Rensa produktnamn** — Lägg till `cleanName()`-funktionen (samma regex som i `ProjectProductsList.tsx`) och applicera på alla produktnamn i renderingen.

**4. Korrekt progress-beräkning** — Räkna bara synliga produkter (exkludera dolda paketkomponenter) i progress-baren.

### Sammanfattning av ändringar

| Vad | Var |
|-----|-----|
| Fetch children-produkter | `linkedProducts` query, rad ~143 |
| Stärk hierarki-gruppering | `productHierarchy` useMemo, rad ~157 |
| cleanName-funktion + applicering | Ny funktion + renderingsblock, rad ~538-598 |
| Dölj is_package_component | Filtrera i hierarki-logik |

Inga andra filer behöver ändras.

