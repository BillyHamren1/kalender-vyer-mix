# Statusändringar (Bekräftad ↔ Offert) syns inte i Planning

## Vad jag ser i verklig data (TEST-WMS-2603-96-R1)

- Lokal bokning har status `OFFER`, senast ändrad av `booking-import` kl 18:31 (svensk tid) — den ändringen `CONFIRMED → OFFER` finns loggad i `booking_changes`.
- Efter det har importen kört var 5:e minut och lyckats. Senaste körningen (22:01) läste källrevision `19:58:36Z` och loggade `outcome: already_current`, `No changes detected ... skipping update`, `status: OFFER`.
- `booking_source_state.applied_source_updated_at` står kvar på `16:30:40Z` trots att nyare revisioner setts — den uppdateras inte när körningen slutar i "inga fältändringar".
- Den gula raden "1 ändring väntar" kommer från den gamla ändringsloggen från 18:31, inte från dina senaste växlingar.

Slutsats: när du växlade tillbaka till Bekräftad och sedan till Offert igen hann/kunde importen inte spegla mellansteget, så lokalt slutvärde blev identiskt med källan (`OFFER`) → inget nytt event → "inget händer". Dessutom säger kortet aldrig vad ändringen är, bara "1 ändring väntar", så du kan inte se att den faktiskt är en offert.

## Vad som byggs

### 1. Visa status direkt i Inkommande bokningar
- Statusmärke (Bekräftad / Offert / Avbokad) på varje rad i `IncomingBookingsList`.
- Ändringstexten blir konkret: "Status: Bekräftad → Offert" i stället för "1 ändring väntar" när ändringen är en statusändring.
- Offert-rader får egen visuell markering (blå) så de inte förväxlas med vanliga uppdateringar.

### 2. Self-heal av statusdrift i importen
- I den befintliga "inga ändringar"-vägen: jämför lokal `bookings.status` mot källans status. Skiljer de sig skrivs statusen och en `status_change`-rad i `booking_changes` — även om övriga fält är identiska.
- När en körning slutar i `already_current` ska den sedda revisionen ändå committas till `booking_source_state`, så `applied_source_updated_at` slutar halka efter.
- Extra loggrad när lokal status ≠ källstatus, så drift går att se i loggarna.

### 3. Manuell knapp "Hämta status nu"
- På den granskade raden: tvingar en enkelbokningsimport (`import-bookings` single mode) direkt, så du slipper vänta på 5-minuterscykeln när du testar i Booking.

## Test
- Kontrakttest: importens no-diff-väg måste skriva statusändring när lokal status ≠ källstatus.
- Kontrakttest: `already_current` committar sedd revision.
- UI-test: statusmärke och "Bekräftad → Offert"-text renderas för uppdaterade rader.
- Manuell verifiering direkt efteråt: växla status i Booking, tryck "Hämta status nu", kontrollera att raden byter märke.

## Tekniska noteringar
- Ändringarna sker i `supabase/functions/import-bookings/index.ts` (no-diff-vägen + revisionscommit) och `src/components/project/IncomingBookingsList.tsx` + tillhörande hook.
- Ingen ändring av revisionsvakten, avbokningsflödet eller batchcursorn — bara statusspegling och presentation.
