
## Mål

"Närmsta projekt"-förslaget i huvudjournalen (admin-vyn StaffTimeReports) ska faktiskt vara **geografiskt närmast**, inte "det enda projekt som råkade dyka upp för dagen". Och labeln ska tydligt skilja på "autologin-kandidat" (inom ±2 dagar runt rig/rigdown) och "bara närliggande adress" (utanför fönstret) — utan att binda timern.

## Rotorsak

`src/pages/StaffTimeReports.tsx` (rad 568–594) bygger `knownSites`-poolen och filtrerar bokningar på `eventdate/rigdaydate/rigdowndate = dateStr`. Bokningar vars rig är t.ex. 12 dagar bort hamnar aldrig i poolen, så `findNearestSite()` i `actualStaffDayModel.ts` får en falsk "närmast"-träff.

Westmans (rigday 18/5) → utelämnad. Swedish Game Fair (large_project som matchade datumfönstret bredare) → blev "närmast" trots ~7 km avstånd.

## Ändringar

### 1. Bredda `knownSites`-poolen i `src/pages/StaffTimeReports.tsx`

Ersätt bokningsfiltret med ett **±21-dagars fönster runt visit-datum** baserat på bokningens hela livscykel (rigday → rigdown):

```ts
// pseudo
const windowStart = addDays(dateStr, -21);
const windowEnd   = addDays(dateStr, +21);

supabase.from('bookings')
  .select('id, client, booking_number, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate, status')
  .not('delivery_latitude', 'is', null)
  .lte('rigdaydate', windowEnd)
  .gte('rigdowndate', windowStart)
  .neq('status', 'CANCELLED');
```

För `large_projects` (där `start_date`/`end_date` är `date[]`) görs overlap-checken i JS efter fetch (min(start_date) ≤ windowEnd && max(end_date) ≥ windowStart).

Resultat: alla projekt vars adress kan tänkas vara aktuell finns i poolen. Westmans kommer med.

### 2. Markera "autologin-fönster" per knownSite

Utöka `KnownSite`-typen i `src/lib/staff/pingPlaceSegments.ts` med:

```ts
autoLoginEligible?: boolean;     // visit-datum inom rigday-2d → rigdown+2d
daysFromActiveWindow?: number;   // 0 om inom, annars antal dagar utanför
activeWindowLabel?: string;      // ex. "Rig 18/5–Rigdown 31/5"
```

Beräknas i StaffTimeReports.tsx vid push till poolen.

### 3. Returnera kandidatlista, inte bara `best`, från `findNearestSite()`

I `src/lib/staff/actualStaffDayModel.ts` (rad 1222–1240):

- Behåll `nearestKnownSite` (för bakåtkompatibilitet, =närmast geografiskt).
- Lägg till `candidatesWithinRadius: NearestKnownSiteDebug[]` — alla sites inom **150 m** från klustercentret, sorterade på avstånd.
- Propagera `autoLoginEligible` + `activeWindowLabel` på varje kandidat.

### 4. Bättre label i `src/lib/staff/dayBlockTimeline.ts` (rad 411–425)

Tre fall:

- **Endast en kandidat inom 150 m, autoLoginEligible=true** → "Trolig: {name} ({m} m) — bekräfta".
- **Endast en kandidat inom 150 m, men utanför ±2d-fönstret** → "Närmsta: {name} ({m} m) — ej aktivt {activeWindowLabel}".
- **Flera kandidater inom 150 m** → "Flera projekt på adressen — välj projekt" + lista i tooltip/popover.
- **Ingen kandidat inom 150 m** → "Okänt projekt — sparas som övrigt" (oförändrat).

Inget av detta startar timer automatiskt.

### 5. Spegla samma logik server-side

`supabase/functions/_shared/dayReality.ts` och `supabase/functions/mobile-app-api/index.ts` (rad 11584–11600) har egen `knownSites`-byggning för wrong_reported_site-detektion. Bredda samma fönster där så mobilen får samma "närmsta + autologin"-info som admin-vyn. Inga schema-ändringar.

### 6. Tester

- **Regression**: visit på `(59.7032, 17.6212)` den 6/5 → `nearestKnownSite.id` = `booking:<westmans>`, **inte** Swedish Game Fair.
- **±2d-regel**: visit 16/5 (rigday 18/5) → Westmans `autoLoginEligible = true`. Visit 6/5 → `false`.
- **Flera kandidater**: två confirmed bookings på samma adress → `candidatesWithinRadius.length === 2` → label "Flera projekt på adressen".
- **Tom pool**: ingen kandidat inom 150 m → label oförändrad ("Okänt projekt — sparas som övrigt").

## Filer

- `src/pages/StaffTimeReports.tsx` — bredda fetch, beräkna autoLoginEligible.
- `src/lib/staff/pingPlaceSegments.ts` — utöka KnownSite-typen.
- `src/lib/staff/actualStaffDayModel.ts` — returnera kandidatlista.
- `src/lib/staff/dayBlockTimeline.ts` — ny label-logik.
- `supabase/functions/_shared/dayReality.ts` — spegla typer.
- `supabase/functions/mobile-app-api/index.ts` (rad 11540–11600) — bredda fetch.
- Nya tester under `src/lib/staff/__tests__/`.

## Vad ändras INTE

- Själva `matchKnownSite`-träffen (radius-baserad faktisk site-tilldelning) rörs inte — den är ortogonal mot "närmsta-förslag".
- Ingen autologin införs. Förslag är förslag.
- Inga DB-migrations.
