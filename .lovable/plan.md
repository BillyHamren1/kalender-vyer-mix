

## Plan: Stöd för flera datum per typ i stora projekt

### Problem
Datumväljaren (EditDateDialog) tillåter bara ett enda datum per typ (rigg/event/nedrivning). Stora projekt behöver kunna ha flera riggdagar, eventdagar och rivdagar.

### Databasändring
Migrera `large_projects`-tabellens datumkolumner till array-format:
- `start_date` (date → text[])
- `event_date` (text → text[])  
- `end_date` (date → text[])

Migration:
```sql
ALTER TABLE large_projects 
  ALTER COLUMN start_date TYPE text[] USING CASE WHEN start_date IS NOT NULL THEN ARRAY[start_date::text] ELSE NULL END,
  ALTER COLUMN event_date TYPE text[] USING CASE WHEN event_date IS NOT NULL THEN ARRAY[event_date] ELSE NULL END,
  ALTER COLUMN end_date TYPE text[] USING CASE WHEN end_date IS NOT NULL THEN ARRAY[end_date::text] ELSE NULL END;
```

### Komponentändringar

**1. EditDateDialog — lägg till multi-select-läge**
- Ny prop `multiSelect?: boolean` och `dates?: string[]`
- Byt Calendar `mode="single"` → `mode="multiple"` när `multiSelect=true`
- Ny callback `onSaveMulti?: (dates: string[], startTime, endTime, eventType) => void`
- Valda datum visas som sorterad lista under kalendern

**2. LargeProjectScheduleEditable — visa flera datum**
- Props ändras: `startDate` → `startDates?: string[] | null`
- Varje datumkort visar antal dagar och datumspann (t.ex. "9–11 jun 2026, 3 dagar")
- Klick öppnar EditDateDialog i multi-select-läge

**3. LargeProjectLayout — uppdatera onUpdateSchedule**
- Anpassa save-logiken för att spara datum-arrayer till `large_projects`
- Propagering till bokningar: uppdatera första/sista bokningens datum baserat på projektets datumarray

**4. largeProjectService — anpassa addBookingToLargeProject**
- Hanterar array-format vid initial datuminheritance

### Filer som ändras
- `supabase/migrations/` — ny migration
- `src/components/booking/EditDateDialog.tsx` — multi-select stöd
- `src/components/project/LargeProjectScheduleEditable.tsx` — array-visning
- `src/pages/project/LargeProjectLayout.tsx` — save-logik
- `src/services/largeProjectService.ts` — array-hantering

