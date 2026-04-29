## Mål

I planeringskalendern (`/calendar`):
1. Döp om kolumnen **"Transporter"** till **"Lager"**.
2. Visa det interna Lagerprojektet automatiskt i den kolumnen, **kl 07:00–16:00 varje dag** (alla dagar i synlig vecka/dag).
3. All personal som dras in i Lager-kolumnen ska **automatiskt synas som tillgänglig i lagerkalendern** (`/warehouse/calendar`) samma datum — utan att man manuellt måste aktivera dem via `WarehouseStaffActivationCard`.

## Ändringar

### 1. Byt namn på kolumnen

**`src/hooks/useTeamResources.tsx`** (rad ~170)
- `transportResource.title`: `'Transporter'` → `'Lager'`
- Behåll `id: 'transport'` (bryter inget — staff_assignments, transport_assignments osv ligger kvar mot detta id).

Ev. visningsetiketter (`useStaffWarehouseSchedule.ts` rad 42, `WarehouseAssignmentTooltip.tsx`, `WarehouseStaffActivationCard.tsx` rad 25) behåller "Transport"-mappningen — de används endast i lagerkalenderns interna översikt och berör inte planeringskalenderns kolumnnamn.

### 2. Lagerprojekt 07–16 i Lager-kolumnen

Generera **virtuella heldagsevent** (07:00–16:00) för det interna Lager-projektet (`projects.is_internal = true`) för varje dag i synligt intervall, med `resourceId: 'transport'`.

Implementation:
- Ny hook `src/hooks/useInternalLagerCalendarEvents.ts`:
  - Hämtar org-ets interna projekt (`is_internal=true`) via befintlig logik (samma query som `warehouseProjectService.ts` rad 619–626).
  - Returnerar `CalendarEvent[]` — ett event per dag i `[start, end]`, kl 07–16, `resourceId: 'transport'`, `eventType: 'internal_task'`, titel = projektets namn ("Lager").
  - Read-only / `editable: false` så det inte går att flytta/ändra av misstag.
- I `src/pages/CustomCalendarPage.tsx`: anropa hooken med synligt datumintervall och merga in i `combinedEvents` tillsammans med befintliga transport-event.

### 3. Auto-tillgänglighet i lagerkalendern

Idag filtrerar `WarehouseCalendarPage` på `useWarehouseStaffActivations().activeStaffIds` (kräver explicit "Aktivera personal"). Vi utökar källan så att personal som har en `staff_assignments`-rad med `team_id = 'transport'` på ett visst datum **räknas som tillgänglig den dagen** — automatiskt, utan permanent aktivering.

Implementation:
- I `useWarehouseStaffActivations.ts`:
  - Lägg till en datum-medveten variant: `getActiveStaffIdsForDate(date)` / `getActiveStaffIdsForRange(start, end)`.
  - Returnerar union av:
    1. Befintliga aktiveringar (permanent + temporary inom datumet).
    2. `staff_assignments` med `team_id = 'transport'` för aktuellt datum (dvs personal som planerats i Lager-kolumnen i planeringskalendern).
  - Realtime-subscribe på `staff_assignments` så listan uppdateras direkt när någon dras in i Lager-kolumnen.
- I `src/pages/WarehouseCalendarPage.tsx` (rad 336–339):
  - Använd den datum-medvetna varianten baserat på `currentWeekStart` + `viewMode`.
  - Skicka det utökade `activeStaffIds` till `useUnifiedStaffOperations` så att personalen syns i lagerkalenderns staff-curtain/timeline samma dag.
- `useWarehouseStaffTimeline` / `useWarehouseStaffScheduleOverview` läser redan från `staff_assignments` med `team_id LIKE 'lager-%'` — utöka dem att också inkludera `team_id = 'transport'` så Lager-passet visas i tidslinjen och inte bara som "tillgänglig".

## Berörda filer (sammanfattning)

- `src/hooks/useTeamResources.tsx` — rename Transporter → Lager
- `src/hooks/useInternalLagerCalendarEvents.ts` — **ny**, virtuella 07–16 events
- `src/pages/CustomCalendarPage.tsx` — merga in interna lagerprojekt-events
- `src/hooks/useWarehouseStaffActivations.ts` — datum-medveten aktiv-lista + realtime
- `src/pages/WarehouseCalendarPage.tsx` — använd datum-medveten variant
- `src/hooks/useWarehouseStaffTimeline.ts`, `src/hooks/useWarehouseStaffScheduleOverview.ts` — inkludera `team_id='transport'` i tidslinjen

## Vad som INTE ändras

- Kolumn-id:t förblir `'transport'` — befintliga transport_assignments, staff_assignments och colorscheme bryts inte.
- Lagerkalenderns egna kolumner (`lager-1`..`lager-N`) påverkas inte.
- Ingen schemamigration krävs — vi återanvänder `staff_assignments` och `projects.is_internal`.
