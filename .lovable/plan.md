
## Problem (bekräftat)

Jobb försvinner från `/calendar` för att `fetchCalendarEvents` i `src/services/eventService.ts` hämtar `calendar_events` **utan paginering och utan radgräns**. PostgREST har en hård default-gräns på **1000 rader**.

Databasen innehåller just nu **1026 planeringsrader** (`event_type <> 'event'`). Konsolen bekräftar:

```
✅ [fetchCalendarEvents] Fetched 1000 real calendar rows in 295ms
```

→ 26 verkliga kalenderhändelser tappas tyst varje load. Vilka 26 som försvinner beror på `order start_time asc` — dvs de **senaste** datumen klipps bort. När importen lägger till nya bokningar trillar äldre/nya rader ur listan beroende på sortering. Detta är källan till "jobb försvinner".

Detta är inte en bug i den nya GPS/workday-logiken — det är en gammal latent gräns som nu slagit i taket när bokningsvolymen passerade 1000 calendar_events.

## Lösning

Två lager av skydd, båda behövs:

### 1. Sidpaginering i `fetchCalendarEvents` (huvudfix)

Byt det enskilda `.select(...)`-anropet mot en loop som hämtar i batchar om 1000 via `.range(from, to)` tills färre än 1000 returneras. Då försvinner gränsen för all framtid, oavsett hur många rader som finns.

```text
let all = []
let from = 0
const PAGE = 1000
loop:
  rows = select(...).range(from, from+PAGE-1)
  all.push(...rows)
  if rows.length < PAGE break
  from += PAGE
```

Logga totalt antal sidor + totalt antal rader så vi ser i konsolen om vi någonsin närmar oss en ny gräns.

### 2. Defensiv date-window-filtrering (sekundär)

Lägg till `.gte('start_time', now - 60 dagar)` och `.lte('start_time', now + 365 dagar)` på själva queryn. Kalendern visar ändå inte rader äldre än ett par månader bakåt, och detta håller payload nere så att paginering nästan aldrig behövs i normalfallet (snabbare laddning + lägre PostgREST-tryck).

Window-storleken görs konfigurerbar via konstanter överst i filen (`CALENDAR_WINDOW_DAYS_BACK = 60`, `CALENDAR_WINDOW_DAYS_FORWARD = 365`) så vi kan utöka utan kodändring i loopen.

### 3. Säkerhetsnät (regression)

Lägg till en `console.warn` om en sida returnerar exakt 1000 rader **men** loopen avbryts (defensivt: borde aldrig hända med korrekt loop, men loggar tydligt om någon framtida ändring råkar bryta paginering).

Lägg till ett enkelt enhetstest `src/test/fetchCalendarEvents.pagination.test.ts` som mockar supabase-klienten och verifierar att 2500 rader fördelade på 3 sidor returneras kompletta (3 × range-anrop, total = 2500).

## Filer som ändras

- `src/services/eventService.ts` — paginerad loop + datumfönster + warn-loggar
- `src/test/fetchCalendarEvents.pagination.test.ts` *(ny)* — paginering-kontrakttest

## Vad fixen INTE rör

- Ingen ändring av `buildPlannerCalendarEvents`, sync, eller import.
- Ingen ändring i den pågående arbetsdag/GPS-logiken (req 1–9).
- Inga DB-migrationer.

## Verifiering efteråt

1. Ladda `/calendar` och bekräfta att konsolen säger `Fetched 1026 real calendar rows` (eller högre) istället för 1000.
2. Bekräfta att `Returning N planner events` ökar motsvarande.
3. Slå upp en booking som tidigare "försvann" (de med senaste `start_time`) och bekräfta att den syns i kalendern igen.

Vill du att jag kör fixen?
