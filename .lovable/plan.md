

## Fix build error + slutför integration

Bygget faller på en TypeScript-typ. Tre småsteg återstår från förra planen.

### Ändringar

1. **`src/services/mobileApiService.ts`** — utöka `WorkdayFlagType`-unionen med `'home_arrival_end_day_adjusted'` så `useEndDayOnArrivalHome` kompilerar.

2. **`src/components/mobile-app/MobileGlobalOverlays.tsx`** — montera `EndDayOnArrivalHomeDialog`. Hämta `completedTravel` och `activeTimers` från samma källor som övriga reseflöden, kör `useEndDayOnArrivalHome(...)`, och rendera dialogen när `suggestion` finns. Tystas (renderas inte) när andra reseflödesdialoger är öppna, parallellt med befintlig `isQuiet`-logik.

3. **Cron-schema för `infer-home-location`** — migration som aktiverar `pg_cron` + `pg_net` (om inte redan på), och schemalägger funktionen dagligen 06:00 Europe/Stockholm via `net.http_post` mot edge-funktionen med service role-header.

### Inget annat ändras

- Ingen ny UI utöver dialogen.
- Ingen ändring i `useWorkSession` eller bannern.
- Copy-testet och cluster-testet är redan på plats.

