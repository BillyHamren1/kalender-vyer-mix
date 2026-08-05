# Återställ personalkalendern efter felaktig massavbokning

## Vad som faktiskt hände (verifierat i databasen)

- 2026-08-04 kl. 17:11 (UTC) avbokades **80 bokningar** i en enda körning, en per sekund, med `changed_by = service_role`. Det matchar exakt `PER_RUN_LIMIT_DEFAULT = 80` i edge-funktionen `reconcile-booking-status`, som går var 10:e minut och tittar i fönstret −7/+90 dagar.
- Avbokningsflödet raderar bokningarnas `calendar_events`. Därför är kalendern tom: vecka 2026-08-03 har **1 kalenderhändelse** kvar, medan **21 bokningar** har datum den veckan. Totalt 106 bokningar står nu som CANCELLED.
- Bokningarna är **inte** avbokade i Booking. Direkt kontroll mot export-API:t för 2605-67 svarar `found: true`, `source_status: "Confirmed"`, med riggdagar 3–5 aug och nedriggning 10–12 aug.
- De avbokade raderna saknar `last_applied_source_revision` och har ingen rad i `booking_source_state`, dvs. avbokningen skedde utan giltig canonical revision.

Kvarstående osäkerhet: den exakta kodvägen som tillät avbokningen kunde inte bekräftas mot dagens kod (nuvarande `evaluateDestructiveAction` kan inte avboka ett `found`-svar). Sannolikt kördes en äldre deployad version. Därför är första steget i planen att bevisa vägen innan något förebyggande antas vara på plats.

Relaterat fynd: Booking svarar numera med `contract_version: "1.1"`, men `SUPPORTED_CONTRACT_VERSIONS` i `_shared/singleBookingSource.ts` tillåter bara `1` och `1.0`. Alla single-booking-svar tolkas därmed som tekniskt fel just nu.

## Plan

### 1. Bevisa och stoppa blödningen
- Pausa cron-schemat för `reconcile-booking-status` tills orsaken är bekräftad.
- Kör funktionen i ett torrläge (`booking_id` + `limit: 1`) mot en av de felaktigt avbokade bokningarna och logga `decision.reason`, så att den faktiska vägen till `cancellation` fastställs innan koden ändras.

### 2. Rätta kontraktsläsningen
- Lägg till `1.1` i `SUPPORTED_CONTRACT_VERSIONS` (och gör versionsjämförelsen major-baserad så att kommande `1.x` inte fastnar).
- Behåll principen att okänd major-version = tekniskt fel, aldrig avbokning.

### 3. Hårda avbokningsvägen
- Extra spärr i `reconcile-booking-status`: avbokning får bara ske när det externa svaret uttryckligen är `absent` med destruktiv reason **och** giltig tombstone. Alla andra utfall loggas som mismatch utan mutation.
- Inför ett tak per körning (t.ex. max 3 avbokningar per run, resten loggas som `cancellation_batch_guard`). En körning som vill avboka 80 bokningar är alltid ett systemfel, aldrig verklighet.

### 4. Återställ data
- Identifiera de 80 bokningar som avbokades i tidsfönstret 2026-08-04 17:00–17:30 via `booking_changes`.
- Verifiera varje boknings status mot Booking-API:t. Endast de som svarar `found: true` med icke-avbokad status återställs.
- Sätt tillbaka status till källans status och kör `import-bookings` med `only_booking_ids` för dessa, så att `reconcileCalendarEvents` bygger om rig-/nedriggningsdagar från källans datum.
- Återkoppla projekt/lager-kopplingar som avbokningen nollade (`assigned_to_project`, `assigned_project_id`, `assigned_project_name`).

### 5. Verifiering
- Kontrollräkning: antal `calendar_events` per vecka aug–okt före/efter, och att vecka 2026-08-03 åter har händelser för alla 21 bokningar med datum den veckan.
- Öppna personalplaneringskalendern i preview och bekräfta att veckan visar jobb igen.
- Testsvit för avbokningskontraktet körs om, plus nya tester för contract_version 1.1 och batch-taket.

## Viktigt att veta

Kalenderhändelsernas **teamplacering** (`resource_id`) fanns bara i de raderade raderna och finns inte i någon logg. Återskapade dagar hamnar därför på importens standardteam och behöver placeras om manuellt i kalendern. Datum, tider och bokningar återställs fullt ut; teamfördelningen måste sättas om för hand.
