

## Backtracka dagens rörelser för Raivis & de 8 andra

### Vad vi har att jobba med

**Det vi INTE har:**
- `staff_location_history` är tom för dem fram till nu (inserts failade tyst pga uuid-typen).

**Det vi HAR (källor med dagens data):**
1. **`staff_locations`** — senaste position per staff (uppdateras varje ping). Räcker bara för "var är de NU", inte historik.
2. **`location_time_entries`** — geofence-baserade in/ut-händelser för lager och projekt. Har `entered_at`/`exited_at` per location. Detta är guldet.
3. **`travel_time_logs`** (om den finns) — restidssegment mellan platser.
4. **`time_reports`** med `source='location_auto'` — auto-genererade från location_time_entries, har start/slut.
5. **`workday_flags`** — händelser under dagen (arrival_prompt, end_day, etc).
6. **Edge function-loggar för `mobile-app-api`** — varje `report_location`-anrop loggas. Här finns lat/lng + timestamp för varje ping idag, även de som failade på history-insert. **Detta är den enda källan till råa GPS-punkter retroaktivt.**

### Min plan: två-stegs backtrack

**Steg 1 — Backfill från strukturerade källor (snabbt, säkert)**
Skapa en read-only admin-vy `/ops-control` → "Backtrack dag" som för en vald staff + datum:
- Hämtar alla `location_time_entries` för dagen → visar "På lager 06:30–08:02", "På SP Office Data 09:45–14:10".
- Hämtar `travel_time_logs` → visar "Resa lager → SP Office 08:02–09:45".
- Hämtar `workday_flags` → visar prompts/beslut på tidslinjen.
- Hämtar nuvarande `staff_locations`-row → visar "Senast sedd HÄR kl XX:XX".
- Renderar en **timeline + karta** med dessa segment.

Det här ger en komplett bild av **var de var och när**, även utan GPS-punkter. För Raivis idag innebär det:
- Lager 06:30 → 08:02 (från location_time_entries)
- 08:02 → nu: position vid 08:02 + senaste ping vid 08:41 (Stockholm city) → vi kan visa de två punkterna med en streckad linje.

**Steg 2 — Råa GPS-punkter från edge function-loggar (engångsjobb)**
För att fylla `staff_location_history` retroaktivt med dagens pings:
- Skriv ett **engångsskript** (edge function `backfill-location-history`) som:
  - Läser edge function-loggarna för `mobile-app-api` action=`report_location` för senaste 24h.
  - Filtrerar på de 9 staff_ids med legacy-format.
  - Parsar lat/lng/timestamp/accuracy ur log-payloaderna.
  - Inserterar i `staff_location_history` (idempotent: ON CONFLICT på `staff_id, recorded_at`).
- Körs en gång manuellt från admin-knappen "Backfilla GPS-historik (idag)" på `/ops-control`.
- Loggarna har retention 7 dagar i Supabase, så vi backar bara dagens.

**Begränsning:** Loggarna kan vara avkortade eller bara innehålla request-metadata (inte body). Vi får verifiera vad som faktiskt ligger där innan vi lovar fullständig backfill. Om body inte finns → Steg 1 är allt vi får för historiken.

### Filer som ändras
- `supabase/functions/backfill-location-history/index.ts` — NY (engångsjobb mot logs API)
- `src/components/ops/StaffDayBacktrackDialog.tsx` — NY (timeline + karta-vy)
- `src/components/ops/OpsControlPage.tsx` — lägg till "Backtrack dag"-knapp per staff
- `src/hooks/useStaffDayTimeline.ts` — NY (aggregerar location_time_entries + travel + flags + history)

### Inga DB-ändringar
Tabellen är redan migrerad. Inget mer schema behövs.

### Vad jag INTE bygger
- Historisk backfill äldre än idag — loggarna finns inte kvar.
- Live-replay (animerad rörelse) — kan komma senare, börjar med statisk timeline+karta.

