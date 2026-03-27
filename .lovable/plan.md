

# Förbättra Etableringsfliken - Rensa & Gör Funktionell

## Problem
1. **Aktiviteter är hårdkodade** - `generateDefaultTasks()` skapar alltid samma 8 uppgifter, inget sparas i databasen
2. **"Lägg till aktivitet"-knappen gör ingenting**
3. **Sidopanelen är rörig** - AI-assistent + drag-drop datapanel tar plats utan att ge värde
4. **Ingen CRUD** - kan inte skapa, redigera eller ta bort aktiviteter

## Vad som byggs

### 1. Ny databastabell `establishment_tasks`
Persistera aktiviteter per bokning istället för hårdkodade defaults.

```sql
create table establishment_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  title text not null,
  category text not null default 'installation',
  start_date date not null,
  end_date date not null,
  completed boolean default false,
  sort_order int default 0,
  notes text,
  assigned_to uuid references staff_members(id),
  source text default 'manual', -- 'manual', 'product', 'default'
  source_product_id uuid references booking_products(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
RLS: authenticated users full access (samma mönster som establishment_subtasks).

### 2. Service-fil `establishmentTaskService.ts`
- `fetchTasks(bookingId)` - hämta alla tasks
- `createTask(task)` - skapa
- `updateTask(id, updates)` - uppdatera (completed, title, dates)
- `deleteTask(id)` - ta bort
- `generateDefaultTasks(bookingId, rigDate, eventDate)` - skapa standarduppsättning i DB vid första besök

### 3. Rensa layouten
- **Ta bort** `EstablishmentAIAssistant` från Gantt-vyn (AI-panelen)
- **Ta bort** `EstablishmentDataPanel` (drag-drop-panelen)
- **Ersätt sidopanelen** med en kompakt bokningssammanfattning direkt i Gantt-kortet (produkter, datum, personal - bara text, ingen drag-drop)
- Gantt-schemat tar nu full bredd istället för att dela med sidopanel

### 4. "Lägg till aktivitet" - Dialog med två lägen
En dialog som öppnas vid klick på knappen:

**Snabbval från bokning:**
- Lista produkter från bokningen som klickbara förslag
- Klick → skapar aktivitet med produktnamn som titel, riggdatum som default, kategori auto-mappad
- Ex: "H Mastertent - 3x3" → kategori `installation`, datum = riggdag

**Manuellt:**
- Titel (fritext)
- Kategori (dropdown: Transport, Material, Personal, Installation, Kontroll)
- Start-/slutdatum (datumväljare, default = riggdag)

### 5. Gantt-schemat använder DB-data
- Vid första laddning: om inga tasks finns → kör `generateDefaultTasks` för att skapa standarduppsättningen i DB
- Sedan hämtas alltid från DB
- Klick på task → öppnar befintliga `EstablishmentTaskDetailSheet` (med subtasks)
- Checkbox/klick för att markera som klar
- Högerklick/knapp för att ta bort

## Teknisk plan

| Fil | Ändring |
|---|---|
| `supabase/migrations/new` | Skapa `establishment_tasks`-tabell + RLS |
| `src/services/establishmentTaskService.ts` | Ny CRUD-service |
| `src/components/project/EstablishmentGanttChart.tsx` | Refaktorera: ta bort sidopanel, hämta tasks från DB, koppla "Lägg till"-knappen |
| `src/components/project/AddEstablishmentTaskDialog.tsx` | Ny dialog med snabbval + manuellt läge |
| `src/components/project/EstablishmentGanttChart.tsx` | Ta bort imports av AI/DataPanel |

Befintliga filer som **inte ändras**: `EstablishmentTaskDetailSheet`, `EstablishmentPage` (tabs behålls), `DeestablishmentGanttChart`.

