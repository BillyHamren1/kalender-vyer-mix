
# Plan: Återställ korrekta förälder-barn-relationer

## Problemet

Den tidigare migrationen använde `ORDER BY bp.id::text` för att bestämma produktordning, men UUID:er är **slumpmässiga** och bevarar INTE importordningen. Detta resulterade i att:
- F12-komponenter (`⦿ F12/20 Ben 3m`) pekar på Multiflex-paket
- Komponenter från ett paket blandas med ett annat

## Lösning

Använd `parent_package_id` (externt API-ID) för att gruppera produkter som tillhör samma paket, och matcha sedan mot rätt intern huvudprodukt baserat på **namnprefix-matchning**:

| Komponentprefix | Ska tillhöra |
|-----------------|--------------|
| `⦿ F12...` eller `⦿ F12/20...` | `F12 - 12x10/300` |
| `⦿ M ...` (M + mellanslag) | Närmaste `Multiflex X` i samma `parent_package_id`-grupp |

## Teknisk implementation

### Steg 1: SQL-migration för att fixa F12-produkter

Alla produkter med `parent_package_id = '00b1ca3b-de36-4ec4-a7a8-dd441152748a'` och namn som börjar med `⦿ F12` ska få `parent_product_id` satt till F12-paketets ID.

```sql
-- Fix F12 components - link to F12 - 12x10/300
UPDATE booking_products
SET parent_product_id = '4be34fff-95d2-4dda-8429-b1a8e13ee255'
WHERE booking_id = 'ab56b4f6-5eaa-4182-b444-115671442a7f'
  AND parent_package_id = '00b1ca3b-de36-4ec4-a7a8-dd441152748a';
```

### Steg 2: Fixa M-komponenter (Multiflex)

För varje unik `parent_package_id` som innehåller M-komponenter, identifiera vilken Multiflex som är korrekt förälder genom att:
1. Hitta produkter utan parent_package_id (huvudprodukter)
2. Matcha baserat på kontextuell logik (samma paketstorlek etc)

### Steg 3: Generell fix för framtida imports

Uppdatera `import-bookings` Edge Function för att använda `parent_package_id` som grupperingsnykel istället för sekventiell ordning:
- Skapa en map: `parent_package_id → internal parent UUID`
- Vid insert av komponent, slå upp korrekt parent från denna map

---

## Sammanfattning

| Åtgärd | Beskrivning |
|--------|-------------|
| Migration | Fix `parent_product_id` baserat på `parent_package_id` + namnmönster |
| Edge Function | Förbättra relationsskapande att använda external ID-gruppering |

## Förväntad resultat

- F12-komponenter grupperas under `F12 - 12x10/300`
- Multiflex-komponenter grupperas under respektive Multiflex-paket
- Inga blandade paket i packlistan
