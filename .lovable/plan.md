## Vad jag faktiskt mätte i preview

Jag laddade `/large-project/…/establishment` (Almedalsveckan) inloggad och samlade riktiga metrics:

- **First Contentful Paint: 10,3 sekunder** (mål < 2,5 s).
- **246 script-requests** vid första laddning, totalt ~2,8 MB JS.
- **N+1 mot Supabase**: ~15 separata GET `team_vehicle_assignments?…date=eq.YYYY-MM-DD` skickas parallellt vid mount (en per dag i etableringsperioden), plus minst 2 `GET vehicles?select=*` utan filter eller `limit`.
- **Långsamma init-queries**: `large_projects?select=*,large_project…` 601 ms, `user_roles` 559 ms, `bookings?select=*` 584 ms.
- **Tunga komponenter laddas synkront** (network panel): `LargeProjectEditableCostList` (1,5 s), `LargeProjectProductsOverview` (1,4 s), `LargeProjectBookingEconomyBreakdown` (1,4 s), `EstablishmentTaskDetailSheet` (51 kB), `useGeofencing` (66 kB), `i18n/translations` (58 kB), `MobileProjectDetail` (1,3 s).
- **CPU-profil under scroll**: ingen enskild JS-funktion dominerar (alla <2 ms self-time). Lagget kommer alltså INTE från en evig render-loop utan från **nätverk + initial bundle-storlek + många kalla moduler**.

## Rotorsaker (rangordnade)

1. **N+1 mot `team_vehicle_assignments` per dag** i `src/hooks/useTeamVehiclesForDay.ts` (rad 35, 90, 110). Varje dag i etableringskalendern monterar en egen hook, var och en med egen query OCH egen realtime-subscription (filter `date=eq.…`). 14 dagar → 14 queries + 14 realtime-kanaler.
2. **`useGeofencing` (66 kB) importeras på desktop-vägen** trots att den bara behövs i mobile-appen. Dras in via gemensam barrel-import.
3. **Mobil-only-filer (`MobileProjectDetail`, scanner-hooks) dras in i desktop-bundlen** via statisk import istället för lazy.
4. **Tunga panel-komponenter (Economy/Products/EditableCostList, EstablishmentTaskDetailSheet) laddas synkront** även när panelen/fliken inte syns.
5. **`vehicles?select=*` utan filter eller limit** (samma N+1 + duplicerad mellan teamen, ej delad cache).
6. **Initiala selects är `select=*`** på `large_projects`, `bookings`, `vehicles` — drar fält som inte används i vyn.
7. **`i18n/translations` (58 kB) laddas eagerly** — borde vara split per namespace eller komprimerat.
8. **Manifest 401** på `/manifest.json` ger extra error-logg och en bortkastad request på varje navigation (kosmetiskt men brusigt).

Ingen render-loop, inga maximum-update-depth-warnings, inga okontrollerade realtime-storms från projects/bookings själva.

## Vad jag vill bygga (i build-läge)

### Steg 1 – Eliminera N+1 mot team_vehicle_assignments (störst effekt)
- Skapa ny hook `useTeamVehiclesForDays(orgId, isoDates[])` som gör **en** query (`.in('date', isoDates)`) och returnerar en Map.
- Ersätt alla call-sites av `useTeamVehiclesForDay` i etableringskalendern/large project planner med den nya hooken.
- En enda realtime-kanal (`team_vehicle_assignments` filtrerat på `date=in.(…)` eller på `organization_id`), inte en per dag.
- Behåll `useTeamVehiclesForDay` som tunn wrapper för enskilda dagar (mobil/dialog) så övriga callers inte bryts.

### Steg 2 – Code splitting av tunga, valfria paneler
Konvertera till `React.lazy` + `<Suspense>` med skeleton:
- `LargeProjectEditableCostList`
- `LargeProjectProductsOverview`
- `LargeProjectBookingEconomyBreakdown`
- `EstablishmentTaskDetailSheet` (laddas först när sheet öppnas)
- `LargeProjectPlanningPanel` etc. där tab inte är default.

### Steg 3 – Stoppa mobil-/geofence-kod från desktop-bundlen
- Lazy-importera `useGeofencing` bakom platform-gate (endast mobile-appen / Capacitor-native), eller flytta importen till en mobile-only entrypoint.
- Lazy-importera `MobileProjectDetail` (redan i `pages/mobile/…`) — säkerställ att `App.tsx`/router använder `React.lazy` för hela `/m/*`.

### Steg 4 – Strama åt selects
- `large_projects` initial fetch: explicit kolumnlista istället för `*`.
- `vehicles`: explicit kolumner, dela cache via React Query `queryKey: ['vehicles', orgId]` så att alla team återanvänder samma fetch.
- `bookings` listor som driver projektvyn: explicit kolumner.

### Steg 5 – i18n & manifest
- Splitta `src/i18n/translations.ts` per namespace eller lazy-load icke-default-språk.
- Fixa `/manifest.json` 401 (lägg till statisk fil eller ta bort `<link rel="manifest">`).

### Steg 6 – Verifiering (obligatoriskt)
- Vitest: ny test som verifierar att `useTeamVehiclesForDays` gör exakt 1 fetch för N datum (mocka supabase-klienten).
- Browser-test efter varje större ändring: ladda om `/large-project/…/establishment`, läs `browser--list_network_requests`, jämför antal `team_vehicle_assignments`-rader och totalt antal Supabase-requests första 5 s, samt `performance_profile` (FCP).
- Acceptanskriterier: `team_vehicle_assignments`-requests ≤ 2 vid mount, total Supabase-requests första 5 s ≤ 30 (idag 73+), FCP < 3 s på etablering.

## Teknisk detalj

```text
Före:                                  Efter:
useTeamVehiclesForDay(day1) → fetch    useTeamVehiclesForDays([d1..dN]) → 1 fetch
useTeamVehiclesForDay(day2) → fetch    + 1 shared realtime channel
… (×14)                                + delad cache
14 realtime-kanaler                    
```

```text
Bundle (init):                         Bundle (init):
EditableCostList   24 kB               (lazy chunk)
ProductsOverview   29 kB               (lazy chunk)
EconomyBreakdown   43 kB               (lazy chunk)
EstablishmentSheet 51 kB               (lazy on open)
useGeofencing      66 kB               (mobile-only chunk)
MobileProjectDetail 10 kB              (lazy /m/*)
translations       58 kB               (split per namespace)
```

Ingen funktionalitet ändras — bara hur och när data/komponenter hämtas.
