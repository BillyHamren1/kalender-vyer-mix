## Problem

På mobil-tidrapporten (StaffDayDetailSheet → StaffGanttMirrorTimeline) syns en röd text:

> Kunde inte hämta tidslinjen (Edge Function returned a non-2xx status code).

Felmeddelandet kommer från `supabase.functions.invoke('get-mobile-staff-day-report', …)` i `callStaffSnapshotFunction`. Den vägen tas när `getToken()` (mobile-tokenen) saknas, t.ex. i preview/web-läge eller innan MobileAuthContext hunnit autentisera. Då anropas edge-funktionen utan en giltig Bearer-token och svarar 401, vilket React Query exponerar som ett "fel" — trots att engine faktiskt har 0 block för dagen (vilket är det vanliga fallet för en helt orapporterad dag, exakt det användaren ser nu: "Total tid 0h", "Ingen registrerad tid").

Idag har sidan dessutom redan en korrekt empty-state ("Inga händelser registrerade ännu för dagen.") som aldrig syns eftersom error-grenen tar över.

## Mål

- Visa aldrig den tekniska "non-2xx"-strängen för slutanvändaren.
- Behandla 401/empty från snapshot-anropet som "inga händelser ännu" (samma UX som dagen utan rapportering).
- Visa endast ett mjukt, översättbart felmeddelande vid riktiga fel (nätverk nere, 5xx), inte vid auth-läge under uppstart.

## Ändringar (UI only, ingen logik/data ändras)

1. **`src/services/staffSnapshotApi.ts`**
   - I JWT-fallback-grenen (`supabase.functions.invoke`): fånga `FunctionsHttpError` / generiska 401-meddelanden och kasta ett kontrollerat `Error` med kod, t.ex. `new Error('snapshot_unauthorized')` istället för att låta "Edge Function returned a non-2xx status code" bubbla upp.
   - I mobile-token-grenen: behåll dagens beteende men normalisera meddelandet (`snapshot_unauthorized` på 401, `snapshot_failed` på övriga icke-2xx) så UI kan välja text/empty-state.

2. **`src/hooks/useStaffGanttMirror.ts`**
   - Filtrera bort `snapshot_unauthorized` och liknande mjuka fel innan de exponeras som `error`. Returnera istället tomma `blocks` så att StaffGanttMirrorTimeline går in i sin existerande empty-state-gren.
   - `phaseQuery` ändras inte (returnerar redan tomma maps vid fel).

3. **`src/components/mobile-app/time/StaffGanttMirrorTimeline.tsx`**
   - Byt den råa `error.message`-utskriften mot en användarvänlig svensk text utan parentes med teknisk orsak, t.ex.:
     > "Tidslinjen kunde inte uppdateras just nu. Försök igen om en stund."
   - Lägg en tyst console.warn för utvecklare så att vi inte tappar diagnostik.

## Det här ändras inte

- Ingen ändring i edge-funktionen `get-mobile-staff-day-report`, dess auth eller datamodell.
- Ingen ändring i `staff_day_report_cache`, Time Engine eller fallback-logik.
- Ingen ändring i submit-flödet ("Skicka in dagen"), workday eller GPS.
- Ingen ändring i admin-vyn (`/staff-management/time-reports`).

## Verifiering

- Bygg + automatkörning (vitest) — befintliga tester ska gröna.
- Manuell QA i preview /index: ladda om sidan, tidslinjekortet visar antingen block eller den mjuka empty-state-texten, aldrig "non-2xx".
- Lägg till ett litet enhets-test för `callStaffSnapshotFunction` JWT-fallback som verifierar att 401-svar mappas till `snapshot_unauthorized`-felet.

