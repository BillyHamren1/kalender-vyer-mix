# Plan

Jag kommer fixa just problemet att **sluttiden missas när personen lämnar platsen**.

## Vad jag ändrar

1. **Justerar besöksbyggaren i edge-funktionen**
   - Går igenom logiken i `buildExactGeofenceVisits` i `snapshotCache.ts`.
   - Säkerställer att ett geofence-besök stängs på rätt sista tid baserat på pings när personen lämnar platsen, istället för att kunna kapas för tidigt.

2. **Behåller nuvarande regel för hem oförändrad**
   - Jag rör inte logiken för hem/boende eller dagens synliga start/slut-fönster.
   - Fokuset blir bara att rätt `UT`-tid visas för platsraden.

3. **Lägger till test som låser beteendet hårt**
   - Skapar/uppdaterar Deno-test som verifierar att ett besök på t.ex. FA Warehouse får korrekt sluttid när utgående pings finns.
   - Testet ska fånga regressioner så samma fel inte återkommer.

4. **Validerar i preview efter ändringen**
   - Kör riktade tester.
   - Verifierar i preview att raden i tabellen visar korrekt `UT`-tid mot de faktiska pingarna.

## Tekniska detaljer

- Trolig felkälla: `GeofenceVisitsTable` visar `visit.end`, och den kommer från serverns snapshot-builder.
- Den relevanta koden sitter i:
  - `supabase/functions/_shared/staff-gps/snapshotCache.ts`
  - eventuellt testfil under `supabase/functions/get-staff-gps-week-summary/`
- Ingen databasändring behövs.
- Ingen ändring i UI-regler för hem, privat tid eller dagens headerfönster.

## Resultat

Efter ändringen ska platsraden visa den **verkliga sluttiden enligt pings**, så att `UT` inte stannar för tidigt när personen faktiskt lämnar senare.