## Vad som faktiskt händer

UI-grupperingen fungerar — koden i `LargeProjectProductsOverview.tsx` (rad 116–149) bucket-grupperar korrekt på `row.tags` och `row.client`. Anledningen att allt hamnar i **"Ingen tagg (154)"** är att databasen är tom på taggar:

```
booking_products för detta projekt: 492 rader, 0 med tags, 0 med tags_en
```

Vi har alltså två separata problem som båda måste lösas:

1. Vi vet inte säkert vilket JSON-fält i Booking-API:s payload som faktiskt innehåller taggarna. Förra körningen antog `product.tags` / `product.tags_en` på produkt-nivå och fick 0 träffar — antingen heter fältet något annat, eller så ligger taggarna någon annanstans (t.ex. på `product_type`, `category`, `labels`, eller på en related entity).
2. Per-kund-grupperingen fungerar redan — det syns inte just nu eftersom användaren står på "Per typ (tagg)".

## Plan

### Steg 1 — Inspektera den verkliga payloaden (1 ny tillfällig edge function)

Skapa `inspect-booking-payload` som hämtar EN booking från `export_bookings` för aktuell org och returnerar hela JSON-trädet utan att skriva något. Anropa den med en booking från det aktiva large-projektet. Detta avslöjar:
- Om taggar ligger på produktnivå eller booking-nivå
- Exakta fältnamn (`tags`, `categories`, `product_tags`, `labels`, `type`, ...)
- Om de är arrays av strängar eller objekt (`{name, id}`)

Förväntat resultat: ett konkret fältnamn vi kan mappa, eller bekräftelse att Booking-systemet inte skickar taggar för den här orgen ännu.

### Steg 2 — Justera mappningen baserat på fynd

Beroende på vad steg 1 visar:
- **A.** Fältet heter något annat än `tags` → ändra mappningen i `import-bookings/index.ts` (rad 2951 + 3495) och `silent-tags-import/index.ts` (rad 26–27, 182, 190).
- **B.** Taggarna är objekt (t.ex. `[{name: "Möbler"}]`) → normalisera till `string[]` i mappningen.
- **C.** Taggarna ligger på booking-nivå, inte produkt-nivå → fundera om det fortfarande är "per produkt-typ" som vi vill gruppera på. Sannolikt vill vi då ändå mappa booking-taggar ner på alla dess produkter.
- **D.** Booking skickar inga taggar för denna org → rapportera tillbaka till användaren, ingen kod-ändring behövs.

### Steg 3 — Kör en tyst engångsuppdatering

Anropa `silent-tags-import` med bootstrap-token för aktuell org (`f5e5cade-f08b-4833-a105-56461f15b191`). Funktionen är redan byggd för att inte trigga `booking_changes` eller `viewed`-flaggor. Verifiera med ett SELECT efteråt att taggar faktiskt landade.

### Steg 4 — Städa

Ta bort `inspect-booking-payload` (debug-funktionen) när vi har fått svar.

## Vad användaren kommer se efter detta

- "Per typ (tagg)" listar grupper som "Möbler", "Belysning", "Golv", "Tält", ... istället för en enda "Ingen tagg (154)".
- "Per kund" fungerar redan — inga ändringar där.
- "AI-gruppering" är opåverkad.

## Tekniska detaljer

- Inga DB-schema-ändringar behövs (`tags text[]` och `tags_en text[]` finns redan på `booking_products`, GIN-indexerade).
- UI-koden behöver inte röras — den läser redan `tags` korrekt och bucket-loopen är rätt.
- Om steg 1 visar att taggar ligger som objekt, kommer vi normalisera redan i import-mappningen så att `booking_products.tags` förblir `text[]`.
