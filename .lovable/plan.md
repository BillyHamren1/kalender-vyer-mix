## Problem

När nya rigg/rivdagar skapas för en bokning — antingen via Booking-importen (`import-bookings → assignTeamAndTime`) eller via dialogen `AddRiggDayDialog` i kalendern/projektvyn — finns det två luckor som gör att redan planerade jobb verkar hamna i fel team:

1. **`assignTeamAndTime` (supabase/functions/import-bookings/index.ts:1441)** placerar varje ny dag oberoende av övriga dagar för SAMMA bokning. Round-robin/sequential-stacking väljer det team som har tidigast ledig slot — inte det team där bokningens andra dagar redan ligger. Resultat: en bokning sprids över flera team (t.ex. rigdag i team‑3, ny rivdag i team‑1) trots att hela jobbet borde stanna i team‑3. Detta upplevs som att "redan planerade team flyttas".
2. **`AddRiggDayDialog.handleCreate` (src/components/Calendar/AddRiggDayDialog.tsx:178)** kör `upsert` med `onConflict: booking_id,event_type,source_date,organization_id` och sätter `resource_id = event.resourceId`. Om en rad redan finns på datumet i ett annat team så **skrivs `resource_id` över** av den teamkolumn där dialogen öppnades — det vill säga befintlig planering ändras tyst.
3. Dessutom finns ingen "stickiness"-regel som säger att om bokning X redan har dagar i team N så ska nya dagar för X också gå till team N.

Drag-and-drop (`useEventDragDrop`, `useEventOperations`) flyttar bara den händelse användaren aktivt drar — den orsakar **inte** sidoeffekter på andra bokningar. Importens `UPDATE`-väg uppdaterar inte heller `resource_id` på existerande rader, så befintliga rader **flyttas inte direkt** av importen — men nya rader skapas i fel team enligt punkt 1.

## Mål

Garantera tre invarianter, låsta med tester:

- **Andra bokningars `resource_id` rörs aldrig** vid skapande/uppdatering av en bokning.
- **En bokning är "team-sticky"**: nya rig/event/rigDown-dagar för bokning X går alltid till samma team som X redan har dagar i (om det finns).
- **Vid tidskonflikt placeras den nya händelsen ändå** i bokningens egna team — overlap tillåts hellre än att splittra projektet eller skriva över annan bokning.

## Plan

### 1. Inför "project team stickiness" i `import-bookings/assignTeamAndTime`

Före round-robin/stacking, slå upp om bokningen redan har minst en `calendar_events`-rad (oavsett event_type) på något team i 1–5. Om ja:

- Returnera det befintliga teamet direkt och behåll önskad starttid (eller den explicita tiden).
- Logga `[Team Assignment] Sticky: booking X already on team-N → reusing`.
- Endast om bokningen är helt ny i kalendern används nuvarande round-robin / earliest-slot-logik.

För **stora projekt (large_project_id)** ska stickiness gälla per `(largeProjectId, phase, date)` enligt befintlig konsolideringsmodell — alla syskon‑bokningar för samma LP ärver representantens team.

### 2. Skydda existerande `resource_id` i `AddRiggDayDialog`

Ändra `handleCreate` så att den:

1. Först gör en `select` mot `calendar_events` på `(booking_id, event_type, source_date, organization_id)`.
2. Om en aktiv rad finns: **uppdatera bara metadata/tider, ALDRIG `resource_id`**. Visa en informativ toast: "Dagen finns redan i Team N — tiden uppdaterades."
3. Om ingen rad finns: skapa ny rad och använd **stickiness-regeln** (samma team som bokningens övriga dagar), inte `event.resourceId` blint, om de skiljer sig. Om de är samma → ingen ändring i upplevelsen.
4. Mjuk-raderade rader läses inte in (de är redan filtrerade i schema), men säkra mot eventuell oavsiktlig "återuppliva fel team".

### 3. Centralisera stickiness i en delad helper

Skapa `supabase/functions/_shared/team-assignment/projectTeamStickiness.ts`:

- `getStickyTeamForBooking(supabase, bookingId, organizationId): Promise<string | null>` — returnerar bokningens redan etablerade team eller null.
- `getStickyTeamForLargeProject(supabase, largeProjectId, phase, date, organizationId): Promise<string | null>` — speglar LP-konsolideringen.

Importera helpern både i `import-bookings/assignTeamAndTime` och i en frontend-tvilling `src/lib/calendar/projectTeamStickiness.ts` som `AddRiggDayDialog` (och framtida nya day-creators) använder.

### 4. Tester (Deno + Vitest) som låser invarianterna

Skapa nya testfiler:

**Deno (`supabase/functions/import-bookings/`):**
- `assignTeamAndTime.stickiness.test.ts`
  - Bokning utan tidigare rader → första round-robin-team (befintligt beteende).
  - Bokning med rigdag i team‑3 → ny rivdag hamnar i team‑3 även om team‑1 har tidigare ledig slot.
  - Bokning med rigdag i team‑3 där team‑3 redan är upptagen vid önskad tid → fortfarande team‑3 (overlap tillåts hellre än splittring).
  - Stora projekt: andra syskonbokningens nya dag ärver representantens team.
  - **Negativ kontroll**: bekräfta att INGEN annan bokning ändrar `resource_id`.

**Vitest (`src/components/Calendar/__tests__/`):**
- `AddRiggDayDialog.handleCreate.test.tsx`
  - Skapa ny dag på tom slot → använd stickiness-team.
  - Lägg till dag på datum där rad redan finns i annat team → `resource_id` förblir oförändrat, bara metadata uppdateras, toast informerar.
  - Default-flow utan booking-historik → använd `event.resourceId`.

### 5. Manuell verifiering i preview efter byggets gröna körning

Skripta ett kort end-to-end-flow:
- Skapa en bokning, tilldela rigdag till team‑3 manuellt, lägg sedan till en rivdag via `AddRiggDayDialog` öppnad från team‑1‑kolumnen → ny rivdag ska landa i team‑3, befintlig rad oförändrad.
- Kör import-bookings för bokningen igen → ingen rad ska flytta team.

## Tekniska detaljer

| Fil | Ändring |
|---|---|
| `supabase/functions/_shared/team-assignment/projectTeamStickiness.ts` | NY — delad sticky-helper |
| `supabase/functions/import-bookings/index.ts` | `assignTeamAndTime` anropar stickiness-helper FÖRST; återanvänder befintligt team om det finns |
| `src/lib/calendar/projectTeamStickiness.ts` | NY — frontend-tvilling till sticky-helpern |
| `src/components/Calendar/AddRiggDayDialog.tsx` | Pre-select befintlig rad → uppdatera bara metadata; för ny rad → använd sticky-team |
| `supabase/functions/import-bookings/assignTeamAndTime.stickiness.test.ts` | NY Deno-test |
| `src/components/Calendar/__tests__/AddRiggDayDialog.handleCreate.test.tsx` | NY Vitest-test |
| `mem://constraints/project-team-stickiness-v1` | NY core-regel: "Bokningens team ändras aldrig av automatik. Nya dagar ärver bokningens befintliga team. Andra bokningars `resource_id` rörs aldrig." |

## Risker / vad som EJ ändras

- **Drag-and-drop förblir oförändrad** — användaren får alltid flytta manuellt mellan team.
- **Round-robin-logiken behålls** för helt nya bokningar utan tidigare team.
- **Live-kolumnen (team‑11)** är redan borttagen; ingen återinförsel.
- **Large project planning unit-regeln** (`large_project_team_assignments` styr team) lämnas orörd; sticky-regeln kompletterar den.

