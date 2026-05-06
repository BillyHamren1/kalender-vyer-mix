---
name: Large Project Dates Local Authority
description: Stora projekts datum (rig/event/rigdown) ägs lokalt av large_projects; skriv aldrig till externa Bokning-API:t
type: constraint
---

Stora projekts datum (rig/event/rigdown) ägs av tabellen `large_projects` LOKALT.

**Förbjudet:** Skriva LP-datum till externa Bokning-API:t via `planning-api-proxy` (`updateBookingDatesViaApi` etc). Externa systemet erkänner inte LP-datum på sub-booking-nivå och returnerar `400 Unknown type: bookings`.

**Hur kalendern hålls i synk:**
1. Skriv nya datum till `large_projects.{start_date,event_date,end_date}` (lokalt).
2. Anropa `import-bookings` med `localOnly:true` per sub-booking. Reconcileraren har en REP-path som läser LP-datumen från `large_projects` och materialiserar `calendar_events` därifrån (se `supabase/functions/import-bookings/index.ts` rad ~1046).

**Skiljer sig från vanliga bokningar:** För icke-LP-bokningar gäller fortfarande core-regeln "Booking system is single source of truth" — `updateBookingDatesViaApi` används där.

**Implementerat i:** `src/services/largeProjectScheduleSync.ts` + `src/pages/project/LargeProjectLayout.tsx` (handleScheduleUpdate).
