## Mål
Säkerställa att ändringar i Booking alltid syns i Planning direkt efter sync, utan att `bookings` och `calendar_events` kan glida isär.

## Vad jag har verifierat
- Webhook/jobbkedjan tar nu emot och behandlar uppdateringen för den aktuella bokningen.
- `booking_sync_jobs` går till `completed`.
- `bookings`-raden är uppdaterad.
- Men `calendar_events` för samma `booking_id` ligger kvar med gamla datum/tider.
- Planning-kalendern läser primärt från `calendar_events`, så användaren ser den gamla versionen även när `bookings` är korrekt uppdaterad.

## Plan
1. Granska och laga reconciler-logiken i `import-bookings`
   - Identifiera exakt varför `calendar_events` inte uppdateras/deletar/skapas om när bookingens fasdatum eller tider ändras.
   - Säkerställa att single-refresh (`syncMode: 'single'`) alltid kör full kalender-reconcile för den bokningen.

2. Verifiera event-typs- och payloadflöde i intake/import
   - Kontrollera att varianter som `booking.updated`, `booking.time.updated`, `booking_updated` och `booking.time_updated` inte leder till att importen hoppar över kalender-rebuild.
   - Om nödvändigt normalisera/vidga stödet så tidsändringar också behandlas som full booking refresh.

3. Lägg regressionstest för den exakta buggen
   - Test som bevisar: när booking-datum/tider ändras och bokningen importeras på nytt så speglar `calendar_events` den nya sanningen.
   - Täcka både uppdatering av befintliga dagar och borttagning av gamla/stale dagar.

4. Validera hela flödet efter fix
   - Köra edge function-test(er) för import/sync.
   - Kontrollera preview/read-model-signalen så att Planning faktiskt får den uppdaterade kalenderdatan.

## Tekniska fokusområden
- `supabase/functions/import-bookings/index.ts`
- event-reconcile för `calendar_events`
- `supabase/functions/receive-booking/index.ts`
- `supabase/functions/process-sync-jobs/index.ts`
- ev. testfil för `import-bookings`/sync-kedjan

## Förväntat resultat
När en bokning ändras i externa Booking-systemet ska både lokal `bookings`-rad och lokala `calendar_events` uppdateras konsekvent, så Planning visar samma data utan eftersläpning.