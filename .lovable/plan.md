
## Problemet

I `ProjectProductsList.tsx` döljs alla barn-produkter bakom ett klickbart kollaps, oavsett typ. Det innebär att tillbehör (dubbelpilar, `is_package_component: false`) inte syns direkt utan kräver klick på föräldern.

## Önskat beteende

| Produkttyp | Prefix i namn | is_package_component | Visas? | Hur? |
|---|---|---|---|---|
| Huvudprodukt | (inget) | null | Ja | Alltid, som rubrik |
| Paketkomponent | `-- M Ben` etc. | true | Nej | Döljs helt |
| Tillbehör | `└, Kassetgolv` etc. | false | Ja | Alltid synlig direkt under föräldern |

## Lösning

Ändra `ProjectProductsList.tsx` så att:

1. **Barn-produkter delas upp** i två grupper per förälder:
   - `accessories` — `is_package_component === false` (dubbelpilar) → alltid synliga
   - `packageComponents` — `is_package_component === true` (enkelpil + streck) → döljs

2. **Ingen Collapsible** behövs längre för normala föräldrar med bara tillbehör. Tillbehören renderas direkt under föräldern utan klick.

3. **ChevronRight och count-badge** (t.ex. `(17)`) tas bort eller justeras — räknar bara tillbehör.

4. **Räknaren i footern** (`19 produkter`) uppdateras för att inte räkna paketkomponenter.

## Ny renderingslogik (pseudokod)

```text
För varje huvudprodukt:
  accessories = barn där is_package_component = false
  (packageComponents filtreras bort, visas ej)
  
  Visa förälder (bold, namn rensat)
  För varje accessory:
    Visa direkt under föräldern med ↳-ikon och indragning
```

## Filer att ändra

| Fil | Ändring |
|---|---|
| `src/components/project/ProjectProductsList.tsx` | Dela upp barn i accessories/paketkomponenter, rendera accessories alltid synliga, dölj paketkomponenter, ta bort onödig Collapsible |

## Resultat

- "Kassetgolv 10x21", "Nålfiltsmatta - Antracit", "M Gaveltriangel" etc. syns direkt under Multiflex utan att klicka
- "M Ben", "M Takbalk GUL" etc. visas inte alls
- Listan blir renare och mer lättläst
