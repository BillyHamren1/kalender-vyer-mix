
# Klickbara Gantt-kort med detaljplanering

## Sammanfattning
Varje Gantt-stav (t.ex. "Lastning", "Transport till plats", "Montering dag 1") ska kunna klickas for att oppna en detaljerad planeringsvy. I den vyn kan man:
- Dela upp aktiviteten i delsteg (sub-tasks)
- Tilldela personal till varje delsteg
- Ange start-/sluttider mer granulart (klockslag)
- Markera delsteg som klara
- Lagga till anteckningar

## Anvandargranssnittet

Nar man klickar pa en Gantt-stav oppnas en **Sheet (sidopanel)** fran hoger med:

1. **Rubrik** - Aktivitetens namn, kategori-ikon och fargkod
2. **Tidssektion** - Start/slut-datum och tid med redigeringsmojlighet
3. **Delsteg-lista** - En checklista med sub-tasks som kan laggas till, markeras och tas bort
4. **Personaltilldelning** - Dropdown for att tilldela personal fran personalregistret
5. **Anteckningar** - Fritext for instruktioner och noteringar
6. **Status** - Markera hela aktiviteten som klar

## Teknisk plan

### 1. Databastabell: `establishment_subtasks`

Ny tabell for delsteg kopplade till etableringsuppgifter:

```text
establishment_subtasks
+------------------+------------+
| id               | uuid (PK)  |
| booking_id       | uuid (FK)  |
| parent_task_id   | text       | (t.ex. "est-1", "est-5")
| title            | text       |
| description      | text       |
| start_time       | timestamptz|
| end_time         | timestamptz|
| assigned_to      | uuid (FK)  | -> staff_members
| completed        | boolean    |
| sort_order       | integer    |
| created_at       | timestamptz|
| updated_at       | timestamptz|
+------------------+------------+
```

### 2. Ny komponent: `EstablishmentTaskDetailSheet.tsx`

En Sheet-komponent som oppnas vid klick pa en Gantt-stav. Innehaller:

- Uppgiftens rubrik med ikon och fargkodad badge
- Redigerbar start-/sluttid (datum + klockslag)
- Lista over delsteg med:
  - Checkbox for klarmarkering
  - Titel (redigerbar inline)
  - Tilldela person
  - Ta bort-knapp
- "Lagg till delsteg"-knapp
- Anteckningsfalt (textarea)
- Personaltilldelning for huvuduppgiften
- Spara/stang-knappar

### 3. Service-fil: `establishmentSubtaskService.ts`

CRUD-funktioner:
- `fetchSubtasks(bookingId, parentTaskId)` - Hamta alla delsteg
- `createSubtask(data)` - Skapa nytt delsteg
- `updateSubtask(id, updates)` - Uppdatera delsteg
- `deleteSubtask(id)` - Ta bort delsteg

### 4. Koppling i EstablishmentPage

Koppla `onTaskClick`-proppen i bade `EstablishmentGanttChart` och `DeestablishmentGanttChart` sa att klick oppnar den nya sheeten med ratt task-data och bookingId.

### 5. Visuell feedback pa Gantt-stavar

Stavar som har delsteg visar en liten progress-indikator (t.ex. "3/5" eller en tunn progress-bar langst ner pa staven) sa att man ser hur langt detaljplaneringen kommit utan att behova klicka.

### Filer som skapas/andras

| Fil | Aktion |
|-----|--------|
| `supabase/migrations/xxx.sql` | Skapa `establishment_subtasks`-tabellen |
| `src/services/establishmentSubtaskService.ts` | Ny - CRUD for delsteg |
| `src/components/project/EstablishmentTaskDetailSheet.tsx` | Ny - Detaljplaneringsvy |
| `src/pages/project/EstablishmentPage.tsx` | Andra - Koppla onTaskClick + rendera sheeten |
| `src/components/project/EstablishmentGanttChart.tsx` | Andra - Visa progress pa stavar |
| `src/components/project/DeestablishmentGanttChart.tsx` | Andra - Samma onTaskClick + progress |
| `src/integrations/supabase/types.ts` | Uppdatera med ny tabell-typ |
