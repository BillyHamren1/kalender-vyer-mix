## Problem

Din to-do "Upphämtning" 2026-05-14 finns i `calendar_events` (`event_type='todo'`) men syns inte i personalkalendern.

**Rotorsak:** ID-format-mismatch på team-resursen.

- `TodoPlanningSheet.tsx` sparar `resource_id` som `team1`, `team2`, … `team5` (utan bindestreck).
- Personalkalendern (`useTeamResources`) renderar kolumnerna `team-1`, `team-2`, … `team-10` (med bindestreck).
- Passthrough-logiken i `plannerCalendarDerivation.ts` släpper igenom event:et, men eftersom `resourceId` inte matchar någon kolumn hamnar det "i tomma luften" och visas aldrig.

DB-rad som ligger där nu:
```
id=df56ba7a… title=Upphämtning event_type=todo resource_id=team1
start=2026-05-14 10:01  end=2026-05-14 14:00
```

## Fix

### 1. `src/components/todo/TodoPlanningSheet.tsx`
- Ändra `teams`-arrayen från `team1…team5` till `team-1…team-10` (matcha `useTeamResources.defaultTeams`).
- Default `setResourceId('team-1')`.
- Behåll labels "Team 1"–"Team 10".
- (Ta bort kommentaren om `'project'` om den inte används — håll det enkelt: bara teamen.)

### 2. Migration: backfill existerande todo-rader
- En idempotent migration som mappar `resource_id` `'teamN'` → `'team-N'` på `calendar_events` där `event_type='todo'`.
- Detta gör att din nuvarande "Upphämtning" dyker upp på Team 1.

### 3. Verifiering
- Kör `bunx vitest run src/services/__tests__/plannerCalendarDerivation.todo.test.ts` (säkerställa att passthrough fortsatt funkar).
- Lägg ett kort enhetstest för `TodoPlanningSheet` som verifierar att teams-listan använder `team-` prefix.
- Hård-reload av `/calendar` → bekräfta att den orange to-don visas på Team 1 den 14 maj.

## Det som INTE ändras
- `plannerCalendarDerivation.ts` (passthrough redan korrekt).
- `ResourceData.ts` orange-färg redan på plats.
- Realtime-prenumerationen — redan på `calendar_events`.
- `CreateTodoWizard.tsx` använder inget team-id (planering sker i `TodoPlanningSheet`).

## Filer

- **Edit:** `src/components/todo/TodoPlanningSheet.tsx`
- **New:** `supabase/migrations/<timestamp>_fix_todo_resource_id_format.sql`
- **New (valfritt):** `src/components/todo/__tests__/TodoPlanningSheet.teamIds.test.tsx`
