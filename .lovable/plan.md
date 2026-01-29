
Målet är att när du avbokar i externa systemet så ska vår app (via `import-bookings`) uppdatera bokningen lokalt till `CANCELLED` och därmed:
1) ta bort ev. kalender-events kopplade till bokningen
2) inte visa bokningen som “ny/oöppnad” i dashboarden

Jag kan redan se i dina nätverksloggar exakt varför “inget händer” just nu:
- `POST /functions/v1/import-bookings` svarar med `cancelled_bookings_skipped: ["190895cc-b4ee-43a9-be69-200eac620087"]`
- direkt efter hämtar dashboarden oöppnade bokningar och får tillbaka samma bokning med `status:"CONFIRMED"`
Det betyder: avbokningen kommer in i syncen, men edge-funktionen hoppar över CANCELLED innan den ens tittar på om bokningen finns lokalt och därför uppdateras varken `bookings.status` eller kalendern.

## Del A — Fix i Edge Function: processa CANCELLED om bokningen redan finns
### Fil: `supabase/functions/import-bookings/index.ts`

1) Ändra ordningen i loopen:
   - Idag gör vi:
     - läsa `bookingStatus`
     - om `CANCELLED` => `continue` (skip)
     - först därefter leta upp `existingBooking`
   - Vi ska istället:
     - läsa `bookingStatus`
     - leta upp `existingBooking` (via `existingBookingMap` / booking_number-map)
     - om `bookingStatus === CANCELLED` och `existingBooking` finns:
       - behandla som status-uppdatering (inte skip)
       - uppdatera lokala raden i `bookings` till `CANCELLED`
       - rensa kalender-events för `booking_id`
     - om `bookingStatus === CANCELLED` och `existingBooking` INTE finns:
       - behåll dagens beteende: skip (vi vill inte importera “nya” avbokade bokningar)

2) Status-normalisering i edge-funktionen (för robusthet):
   - Införa en liten `normalizeStatus()` i edge-funktionen (samma princip som vi gjorde i frontend) och använd den för:
     - `statusChanged`
     - `wasConfirmed` / `isNowConfirmed`
   - Detta gör att historiska värden (t.ex. “Bekräftad” / “Confirmed”) fortfarande triggar borttag när status blir CANCELLED.

3) Kalender-rensning vid “CONFIRMED -> ej CONFIRMED”:
   - Behåll den logik vi redan la in, men basera `wasConfirmed/isNowConfirmed` på normaliserade statusar.
   - Säkerställ att rensningen körs även för CANCELLED (som idag aldrig når hit pga early-skip).

4) Logging + resultatobjekt:
   - Lägg tydliga loggar:
     - “CANCELLED booking exists locally → updating status + removing calendar events”
     - “CANCELLED booking does not exist → skipping”
   - (Valfritt men bra) lägg till en ny result-lista typ `cancelled_bookings_processed` för att kunna se i svaret att den faktiskt hanterades (istället för att hamna i `cancelled_bookings_skipped`).

## Del B — Dashboard: “Nya oöppnade bokningar” ska inte lista CANCELLED/DRAFT
Just nu saknar queryn status-filter och tar allt som `viewed=false` + har datum i framtiden, vilket gör att avbokade (och även DRAFT) kan ligga kvar.

### Fil: `src/services/planningDashboardService.ts`
1) Uppdatera `fetchUnopenedBookings()`:
   - Lägg till status-filter så listan bara visar relevanta “nya”:
     - exempel: `.eq('status', 'CONFIRMED')`
   - Då kommer avbokade automatiskt försvinna från listan när status väl uppdateras till `CANCELLED`.

(Om ni i framtiden vill visa “nya men ej bekräftade” i en separat lista kan vi göra det, men detta fixar exakt det du klagar på nu: att avbokade ligger kvar och skräpar.)

## Del C — Dashboard uppdateras direkt när man öppnar en bokning (snabb UX)
Du nämner också att bokningar “ligger kvar där hela tiden” även efter att man öppnat dem. Vi har logik som sätter `viewed=true` när man öppnar bokningen, men dashboarden uppdateras på polling (30s) och invalidation saknas i den flödespunkten.

### Fil: `src/hooks/booking/useBookingFetch.tsx`
1) När `markBookingAsViewed(id)` lyckas:
   - använd React Query’s `useQueryClient()` och kör:
     - `queryClient.invalidateQueries({ queryKey: ['planning-dashboard','unopened-bookings'] })`
   - Resultat: listan uppdateras direkt när man öppnar en bokning (inte “någon gång senare”).

## Testplan (så vi vet att det funkar på riktigt)
1) I externa systemet: avboka bokning `190895cc-b4ee-43a9-be69-200eac620087` (eller annan testbokning).
2) Kör sync/import i appen (eller vänta på background import).
3) Verifiera att `import-bookings`-svaret nu visar att bokningen hanterats (inte “skipped”) och att `bookings.status` blir `CANCELLED`.
4) Verifiera att:
   - bokningen försvinner från “Nya oöppnade bokningar” (pga status-filter +/eller viewed invalidation)
   - event (om det finns) försvinner från `calendar_events` och `warehouse_calendar_events`
5) Kolla edge function logs för “removing calendar events” loggar.

## Filer som kommer ändras
- `supabase/functions/import-bookings/index.ts` (huvudfixen: CANCELLED får inte short-circuit-skippas om den redan finns lokalt)
- `src/services/planningDashboardService.ts` (filter: endast CONFIRMED i oöppnade-listan)
- `src/hooks/booking/useBookingFetch.tsx` (invalidate planning-dashboard query efter `viewed=true`)

## Risker / Edge-cases
- Om externa systemet skickar CANCELLED men vi aldrig haft bokningen lokalt: vi fortsätter att skippa (avsiktligt).
- Om en bokning varit CONFIRMED och hade events, men status blivit CANCELLED: vi tar bort events deterministiskt via `booking_id`.
- Dashboard-listan kommer bli “renare”: DRAFT och CANCELLED syns inte längre som “nya oöppnade” (vilket matchar din feedback).

## Efter implementation (snabb kontroll)
- Jag länkar även till Supabase Edge Function logs för `import-bookings` så du snabbt kan se om en CANCELLED faktiskt processas och rensar events.
