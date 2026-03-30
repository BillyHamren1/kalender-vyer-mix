

## Lägg till personalval i "Lägg till aktivitet"-dialogen

### Problem
Dialogen `AddEstablishmentTaskDialog` saknar ett fält för att tilldela personal (`assigned_to`) vid skapande av aktiviteter. Fältet finns i databasen men exponeras aldrig i UI:t.

### Ändringar

**1. `src/components/project/AddEstablishmentTaskDialog.tsx`**
- Lägg till prop `staffPool: Array<{id: string, name: string}>` (samma typ som redan skickas till EstablishmentTaskDetailSheet)
- Lägg till state `assignedTo` (string | null)
- Lägg till en **Select-dropdown** "Tilldela personal" mellan Kategori och Startdatum i manuella formuläret
- Skicka `assigned_to` i båda `createEstablishmentTask`-anropen (quick-add + manuell)

**2. `src/services/establishmentTaskService.ts`**
- Lägg till `assigned_to?: string | null` i `createEstablishmentTask`-parametern
- Inkludera `assigned_to` i insert-objektet

**3. Föräldrakomponenter som renderar dialogen**
- Skicka `staffPool`-propen från `EstablishmentGanttChart` / `DeestablishmentGanttChart` (eller deras förälder `EstablishmentPage`) där poolen redan hämtas

### Filer att ändra
- `src/components/project/AddEstablishmentTaskDialog.tsx` — ny prop + UI-dropdown + skicka assigned_to
- `src/services/establishmentTaskService.ts` — acceptera assigned_to i create-funktionen
- Föräldrakomponent(er) som renderar dialogen — skicka staffPool-prop

