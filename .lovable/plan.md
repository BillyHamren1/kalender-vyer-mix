

## Fix Dagöversikt — datakälla, format och layout

Tre konkreta fel i `DailyOverviewDialog` + uppströms data:

### 1. Saknar pågående pass → totalt mismatch
Tabellens "2h 40m totalt" inkluderar Jānis pågående lagerpass (`location_time_entries` med `exited_at IS NULL`, startad 06:58). Dialogen frågar bara `time_reports`, där den raden ännu inte finns.

**Fix:** I `StaffTimeReportDetail.tsx`, hämta även `location_time_entries` för dagen (både pågående och avslutade) och bygg syntetiska work-rader till `dailyOverviewWork`. För pågående: `end_time = null`, `hours_worked = (now - entered_at)`. Visa dem med `Pågående`-badge i timeline.

### 2. "2026-" i Första start / Sista slut / tidslinje
`start_time?.slice(0, 5)` antar `HH:MM:SS`-format. När värdet är ett ISO-datetime ("2026-04-21T06:58…") blir resultatet "2026-".

**Fix:** Skapa hjälpare `toHHMM(value)` som hanterar både `HH:MM:SS` och ISO-datetime: om strängen innehåller `T`, plocka ut tiden efter T; annars slice(0,5). Använd överallt i `DailyOverviewDialog.tsx` (rad 328, 329, 375, 377, 198, 201, 214, 217).

### 3. Dialog för smal
`max-w-2xl` (672px) gör att adresser och tidslinje blir avhuggna ("Holmträskvägen 19, 141 91 Hu...") och de fyra summary-korten trängs på två rader.

**Fix:**
- Höj till `max-w-5xl` (1024px).
- Karta: `h-[300px]` → `h-[420px]`.
- Tidslinje-rader: tillåt wrapping av adresser (`break-words` istället för `truncate`).
- "In- och utloggningar"-listan: visa hela passLabel (no truncate) och bryt rad om långt.
- Summary-grid: `grid-cols-2 sm:grid-cols-4` → `grid-cols-4` (alltid på en rad i den bredare dialogen).

### 4. Konsistens-badge
Lägg en liten upplysning under summary om dagen har pågående pass: `⏱ 1 pågående aktivitet — totaltid uppdateras live`. Då blir det tydligt varför "Sista slut" är "—".

### Filer som ändras
- `src/components/staff/DailyOverviewDialog.tsx` — toHHMM-hjälpare, layout, pågående-stöd, ingen truncate.
- `src/components/staff/StaffTimeReportDetail.tsx` — hämta `location_time_entries` för `dailyOverviewDate`, mappa in i `dailyOverviewWork` inkl. pågående.

### Förväntat resultat
- "Arbetstid" matchar tabellens totalsumma (2h 40m, ökar live).
- "Första start" visar `06:58`, "Sista slut" visar "—" + badge "Pågående".
- Adresser och tidslinje syns hela utan klippning.

