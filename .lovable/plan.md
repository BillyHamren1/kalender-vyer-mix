

# Fix: Produkter visas i fel ordning i mobilappen

## Problem
Produkterna visas "huller om buller" eftersom:
1. API:et (edge function) returnerar bara `id, name, quantity, notes` -- saknar `parent_product_id` som behövs för gruppering
2. Ingen `ORDER BY` i databasfrågan -- produkterna kommer i slumpmässig ordning
3. Grupperingslogiken i frontend förlitar sig på att barn-produkter kommer direkt efter sin förälder i arrayen, vilket inte fungerar med slumpmässig ordning

## Lösning

### 1. Edge function: Returnera relationsdata + sortera
Uppdatera produktfrågan i `mobile-app-api` för att inkludera `parent_product_id` och `is_package_component`, samt sortera så att föräldrar alltid kommer före sina barn.

```
Nuvarande:
  .select('id, name, quantity, notes')
  .eq('booking_id', booking_id)

Nytt:
  .select('id, name, quantity, notes, parent_product_id, is_package_component')
  .eq('booking_id', booking_id)
```

### 2. Frontend: ID-baserad gruppering istället för position
Skriv om `groupProducts` i `JobInfoTab.tsx` så den använder `parent_product_id` för att koppla barn till rätt förälder, oavsett ordning i arrayen.

Ny logik:
- Första passet: identifiera alla föräldrar (produkter utan `parent_product_id` och utan tillbehörsprefix)
- Andra passet: koppla barn till sin förälder via `parent_product_id`
- Fallback för barn som saknar `parent_product_id`: använd namnprefix-detektering som backup

### Filer som ändras
- `supabase/functions/mobile-app-api/index.ts` (rad 831) -- lägg till fält + deploy
- `src/components/mobile-app/job-tabs/JobInfoTab.tsx` (rad 54-73) -- ny grupperingslogik

### Resultat
Produktlistan visar förälder-produkter i korrekt ordning med tillbehör dolda bakom ett klickbart chevron, precis som det fungerade innan -- men nu robust oavsett vilken ordning databasen returnerar.

