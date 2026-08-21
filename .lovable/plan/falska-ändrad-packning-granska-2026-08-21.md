# Falska "Ändrad packning — granska"

## Vad som faktiskt händer (verifierat i databasen)

Alla 8 raderna har `needs_packing_review_reason = 'booking_updated'` och status `planning` (packningen är inte påbörjad).

Flaggan sätts av databastriggern `sync_packing_on_booking_change` på tabellen `bookings`. Den sätter `needs_packing_review = true` vid **varje** uppdatering av bokningen där något av dessa fält skiljer sig: kund, rigg/event/rivdatum, alla tre fasernas start/sluttider, adress, interna anteckningar, status, spett/bärsträcka/exakt tid.

Två konkreta problem:

1. **Ingen källkontroll.** Till skillnad från `track_booking_changes` (som bara flaggar när headern `x-lovable-change-source` är `booking-import`/`booking-webhook`) skiljer packningstriggern inte på extern ändring från Booking och Plannings egna skrivningar. När vi själva sätter tider, låser fas, flyttar dag, placerar i stort projekt eller kör om importen flaggas packningen som "ändrad".
2. **`skip_review` når inte packningen.** `import-bookings` nollställer `bookings.needs_review` när Planning-UI:t är avsändare, men rör aldrig `packing_projects.needs_packing_review`. Flaggan blir alltså kvar även när systemet vet att ändringen var vår egen.

Dessutom: för packningar med status `planning` finns inget att granska — packlistan synkas om automatiskt, snapshot-frysningen gäller först när packningen påbörjats.

## Åtgärd

### 1. Källmedveten trigger (migration, endast funktionsändring)

Uppdatera `sync_packing_on_booking_change` så att den behåller all befintlig datasynk (namn, kund, datum, adress, notes, avbokning) men bara sätter `needs_packing_review`/`_reason = 'booking_updated'` när **alla** dessa gäller:

- ändringen kommer från extern källa (samma logik som `track_booking_changes`: header/GUC = `booking-import` eller `booking-webhook`), och
- `app.skip_review` inte är satt till `'true'`, och
- packningen har lämnat `planning` (dvs. arbete har påbörjats och snapshoten är fryst).

`reason = 'cancelled'` vid avbokad bokning behålls oförändrat — det ska alltid synas.

Ingen tabell, kolumn, RLS eller data ändras. Inga DELETE/TRUNCATE.

### 2. Sätt källheader där den saknas

Kontrollera att importens/webhookens Supabase-anrop skickar `x-lovable-change-source` så att den nya regeln klassar externa ändringar rätt (samma mekanik som redan används för `needs_review`). Om headern saknas i något anrop läggs den till där.

### 3. Befintliga falska flaggor

De 8 raderna som redan står som "Ordern har ändrats" försvinner inte av sig själva. De kan tas bort på två sätt:

- manuellt via "Godkänn" per rad i listan (finns redan), eller
- en engångsuppdatering som nollställer `needs_packing_review` för packningar med reason `booking_updated` och status `planning`.

Alternativ 2 är en massuppdatering och körs **bara** om du uttryckligen godkänner det. Standard i den här planen är alternativ 1.

## Verifiering

- Ny vitest som låser triggerns villkor (migrationens SQL-text: källkontroll + skip_review + status-krav).
- Databaskontroll efter migration: räkna rader med `needs_packing_review = true` före/efter en Planning-initierad bokningsuppdatering — antalet ska vara oförändrat.
- Manuell kontroll i preview: `/warehouse` → "Ändrad packning — granska" ska bara visa avbokningar och verkliga externa ändringar på påbörjade packningar.
