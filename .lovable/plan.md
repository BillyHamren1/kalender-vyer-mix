

## Synca aktivitet med personalkalender

### Vad vi bygger

En **opt-in checkbox** "Synca med personalkalender" i både:
1. **ActivityPlannerSheet** (när man skapar nya aktiviteter) — en checkbox per rad i multi-row builder
2. **EstablishmentTaskDetailSheet** (när man redigerar en befintlig aktivitet)

När boxen är ikryssad skapas/uppdateras en riktig `calendar_events`-rad (inte bara overlay) på rätt datum/tid och resurs. Avbockad ⇒ raden tas bort.

### Hur synken fungerar

**Datakälla:** aktivitetens `start_date`, `end_date`, `start_time`, `end_time`, `task_type`, `booking_id`/`large_project_id`.

**Mappning till `calendar_events`:**
- `resource_id` — baserat på `task_type`:
  - `crew` → `team-tasks` (samma kolumn som dagens overlay)
  - `pm` → `team-tasks`
  - `logistics` → `team-tasks`
  - `admin` → `team-tasks`
  *(Vi kan göra dessa konfigurerbara senare; för nu håller vi en kolumn så vi inte krockar med rigg/event-team.)*
- `start_time` / `end_time` — kombinera datum + tid (faller tillbaka till 08:00–16:00).
- `event_type` — ny typ `activity` (separerar dem från rig/event/rigDown).
- `title` — `[Kategori] Aktivitetstitel` ev. + initialer på tilldelade.
- `booking_id` — bokningens ID (eller `project-{largeProjectId}` om standalone, samma mönster som `projectCalendarService`).
- `delivery_address`, `booking_number`, `organization_id` — hämtas från bokning/projekt.
- `source_date` — startdatum.

**Koppling tillbaka till aktiviteten** (för att kunna uppdatera/radera vid edit):
- Lägg till kolumn `calendar_event_id uuid` på `establishment_tasks` (nullable, FK till `calendar_events.id` med `on delete set null`).
- När `calendar_event_id` finns ⇒ aktiviteten är synkad; checkboxen är ikryssad i UI.

**Realtime:** befintlig `useRealTimeCalendarEvents` lyssnar redan på `postgres_changes` på `calendar_events`, så raden dyker upp i kalendern direkt utan reload.

**Multidagars aktiviteter:** vi skapar **en rad per dag** mellan `start_date` och `end_date` (samma mönster som rigg-events idag), alla länkade via samma `calendar_event_id`-grupp — eller enklast: vi lagrar en `activity_group_id` per aktivitet och länkar alla rader på den. Jag föreslår vi börjar med **enkel modell**: en aktivitet = en `calendar_events`-rad spannande start→slut. Multidagsdelning kan vi göra som v2.

### Filer som ändras

**Migration (ny):**
- `establishment_tasks.calendar_event_id uuid null` + index.
- Tillåt `event_type='activity'` (text, ingen check att lätta på).

**Backend-tjänst (ny):** `src/services/activityCalendarSyncService.ts`
- `syncActivityToCalendar(taskId)` — skapar eller uppdaterar `calendar_events`-raden, sparar `calendar_event_id`.
- `removeActivityFromCalendar(taskId)` — raderar raden, nollställer `calendar_event_id`.

**UI-ändringar:**
- `ActivityPlannerSheet.tsx`:
  - Lägg `syncToCalendar: boolean` i `ActivityRow`.
  - En liten checkbox "📅 Synca med kalender" per rad bredvid datum/tid.
  - Efter `createEstablishmentTask` i `handleSaveAll`: om `row.syncToCalendar`, anropa `syncActivityToCalendar(newTask.id)`.
- `EstablishmentTaskDetailSheet.tsx`:
  - Visa en checkbox "Synca med personalkalender" (ikryssad om `task.calendar_event_id`).
  - On-toggle: kalla `syncActivityToCalendar` eller `removeActivityFromCalendar`.
  - När datum/tid uppdateras och `calendar_event_id` finns ⇒ uppdatera kalendern automatiskt.

**Hooks:**
- `useTaskCalendarEvents.ts` — exkludera tasks som har `calendar_event_id` (annars skulle de visas både som overlay och som riktig event = dubblett).
- Inga ändringar i `useRealTimeCalendarEvents` (fungerar redan).

### Edge-cases vi hanterar

- **Aktivitet utan booking_id** (large project utan vald bokning) → använder `project-{largeProjectId}` som booking_id.
- **Datum/tid ändras på en synkad aktivitet** → kalendern uppdateras automatiskt.
- **Aktivitet raderas** → `on delete set null` på FK säkerställer att kalenderraden inte hamnar i limbo, men vi kallar explicit `removeActivityFromCalendar` först.
- **Krock med arkitekturregeln "single-writer via import-bookings"**: import-bookings är skyddad via `event_type IN ('rig','event','rigDown')`. Vi använder `event_type='activity'` så import-bookings rör dem aldrig.

### Vad användaren ser

- I planneraren: en liten "📅 Synca"-checkbox per aktivitetsrad.
- I detaljvyn: en toggle "Synca med personalkalender" — när den slås på dyker aktiviteten upp som riktig kalenderhändelse i Tasks-kolumnen för den/de dagarna.
- Drag-and-drop i kalendern flyttar inte aktivitetens datum (vi behåller `isEventReadOnly` för dessa eller lägger till stöd för att flytta tillbaka till `establishment_tasks` — det blir steg 2).

### Frågor jag medvetet inte ställer

- **Resurskolumn:** jag använder `team-tasks` (samma som overlay-funktionen). Om du vill att aktiviteten istället ska hamna på t.ex. `team-1`/`team-11` baserat på category säg till.
- **Drag-flytt i kalendern uppdaterar aktiviteten:** lämnas till v2; första iterationen är "kalendern visar, planneraren styr".

