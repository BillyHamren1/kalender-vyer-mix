
Målet: stängning av projekt ska alltid skicka signal till Booking, och stängning ska inte “gå igenom tyst” om synken misslyckas.

1) Rotorsak att fixa (identifierad i koden)
- Statusändring via vanliga statusflöden saknar Booking-sync:
  - `projectService.updateProjectStatus(...)` uppdaterar bara lokal status.
  - `jobService.updateJobStatus(...)` uppdaterar bara lokal status.
  - `useLargeProjectDetail` sätter status på `large_projects` utan Booking-sync.
- I `ClosingProjectsList` är sync-fel non-blocking (fångas och ignoreras), så projekt kan stängas lokalt även om Booking aldrig informerades.
- Stora projekt skickar idag ingen booking-id alls i closing-listan (`bookingId: null`), trots att de kan ha flera kopplade bokningar.

2) Ny gemensam synk-orchestrator (en källa till sanning)
- Införa en central tjänst, t.ex. `bookingCloseSyncService.ts`, som:
  - tar emot en eller flera `bookingId`
  - anropar `markReadyForInvoicing`
  - returnerar tydligt resultat (`successIds`, `failedIds`, felmeddelanden)
- All stängningslogik (small/medium/large) använder denna tjänst istället för egna ad-hoc anrop.

3) Gör stängning “strict” i alla flöden
- Regel: om status sätts till `completed` och det finns kopplade bokningar, då måste Booking-sync lyckas först.
- Uppdatera:
  - `projectService.updateProjectStatus`
  - `jobService.updateJobStatus`
  - `useLargeProjectDetail` (hämta alla `booking_id` från `large_project_bookings` vid completed)
  - `ClosingProjectsList.handleCloseProject`
- Vid sync-fel:
  - visa tydlig toast med “inte stängt – synk till Booking misslyckades”
  - avbryt lokal statusuppdatering (ingen tyst mismatch)

4) Rätta stora projekt i closing-vyn
- I `ClosingProjectsList` utöka modellen för large till att bära `bookingIds: string[]`.
- Vid “Stäng projekt” för large:
  - synka alla kopplade bokningar
  - endast om alla lyckas sätts `large_projects.status = completed`.

5) Återställning för projekt du redan stängt
- Lägg till en “Skicka stängda igen till Booking”-åtgärd på `/projects/closing` (t.ex. knapp i header).
- Den hämtar nyligen stängda small/medium/large med kopplade booking-id och kör batch-sync via samma orchestrator.
- Resultat visas med antal lyckade/misslyckade så du direkt ser vad som faktiskt skickats.

6) Verifiering (obligatorisk)
- End-to-end testfall:
  - Stäng small/medium/large och verifiera att Booking-sync-anrop sker.
  - Tvinga sync-fel och verifiera att status INTE blir completed lokalt.
  - Kör “Skicka stängda igen” och verifiera att tidigare stängda faktiskt skickas.
- Kontrollera även att inga gamla flöden längre kan sätta `completed` utan sync.

Tekniska detaljer (kort)
- Primära filer:
  - `src/components/project/ClosingProjectsList.tsx`
  - `src/services/projectService.ts`
  - `src/services/jobService.ts`
  - `src/hooks/useLargeProjectDetail.tsx`
  - `src/pages/ProjectClosing.tsx`
  - ny: `src/services/bookingCloseSyncService.ts`
- Ingen databasändring krävs för grundfixen; fokus är att centralisera och tvinga korrekt sync-beteende i samtliga stängningsvägar.
