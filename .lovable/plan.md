## Mål

När en bil är tilldelad ett team för ett datum (`team_vehicle_assignments`), ska all personal som tillhör samma team den dagen se bilen(arna) som en rad på sitt jobbkort/projektkort i mobilappen — i samma format som personalkalendern: `Bil: Volvo` eller `Bil1: Volvo, Bil2: Sprinter` om flera.

Rent informativ rad. Ingen klickbarhet. Påverkar inte timer/tidsrapport/GPS-logik.

## Steg

1. **Backend — berika dagsjobben med team-bilar**
   - `supabase/functions/mobile-app-api/index.ts` (handler för `get_my_jobs` / dagens jobblista som driver MobileJobs + MobileOverview).
   - För varje (booking, date)-jobb som returneras har vi redan `team_id` (från `calendar_events.resource_id`/BSA).
   - Samla unika `(team_id, date)`-par för dagen → en `select` mot `team_vehicle_assignments` (filter på org + dessa par) → joina mot `vehicles` (`id, name, registration_number, is_external, is_active`) och behåll endast `is_external=false AND is_active=true`.
   - Lägg `team_vehicles: Array<{ id, name, registration_number | null }>` (stabil sort på `name`, svensk locale) på varje jobb-objekt i svaret. Inget annat i svaret ändras.
   - Stora projekt: samma logik per (representant-team_id, date) som LP redan använder för team-resolvning, så hela LP-kortet visar teamets bil.

2. **Frontend — rendera bil-raden**
   - Lägg en liten presentationskomponent `TeamVehicleLine` (delad i `src/components/mobile-app/`) som tar `team_vehicles` och renderar:
     - 0 bilar → `null`
     - 1 bil → `Bil: <name>` (lastbils-ikon till vänster, semantisk färg `text-muted-foreground`)
     - >1 bilar → `Bil1: <name>, Bil2: <name>, …`
   - Montera den högst upp i jobb-/projektkortet på:
     - `src/components/mobile-app/JobCard` (eller motsvarande kort som MobileJobs/MobileOverview använder)
     - LP-kortet i samma lista
     - `MobileJobDetail` (Info-tab, ovanför adressen) så samma info syns även när man öppnat jobbet.

3. **Typer**
   - Utöka `OpsOverviewJob` / motsvarande job-typ i `src/services/mobileApiService.ts` med valfritt `team_vehicles?: Array<{ id: string; name: string; registration_number: string | null }>`.

4. **Tester**
   - Återanvänd `src/test/teamVehicleLine.test.ts` (formaterings-helpern från kalendern) — flytta formattern till `src/lib/teamVehicles.ts` om den ligger inlinad, så både kalender och mobil använder samma `formatTeamVehicleLine()`.
   - Lägg till komponenttest för `TeamVehicleLine` (0/1/2/3 bilar → korrekt sträng).
   - Lägg ett enhetstest för backend-berikningssteget (pure helper som givet jobs + assignments + vehicles returnerar jobs med rätt `team_vehicles`).
   - Kör `bash scripts/test-time-reporting.sh` (sanity, ska inte påverkas) + `bunx vitest run` på de nya filerna.

## Vad som INTE ändras

- Ingen ny tabell, inga RLS-ändringar (`team_vehicle_assignments` finns redan).
- Inga ändringar i timer/Time Engine/tidsrapport/lön/GPS.
- Ingen klickbarhet, ingen fordonsdetaljvy på mobilen.
- Externa fordon visas inte (endast `is_external=false`), samma policy som kalendern.

## Tekniska detaljer

Berikningen sker i samma loop som redan bygger jobbsvaret i `mobile-app-api`, så det blir 1 extra select på `team_vehicle_assignments` + 1 på `vehicles` (eller en enda join) per request — försumbart.
