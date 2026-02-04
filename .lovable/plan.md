
# Plan: Ny projektstruktur med tre nivåer

## Status: ✅ Fas 1-3 Implementerad

### Genomfört

#### Fas 1: Namnbyte ✅
- "Jobb" → "Projekt litet" i all UI
- "Projekt" → "Projekt medel" i all UI
- Uppdaterade komponenter: JobsListPanel, ProjectManagement, IncomingBookingsList, JobDetail

#### Fas 2: Databas ✅
- Ny tabell `large_projects` (huvudprojekt)
- Ny tabell `large_project_bookings` (koppling till bokningar)
- Nya tabeller för tasks, files, comments, purchases, budget
- `bookings.large_project_id` för referens till stora projekt
- Triggers för updated_at

#### Fas 3: Projekt stort - Grundfunktionalitet ✅
- LargeProjectsListPanel.tsx - lista/skapa/ta bort stora projekt
- LargeProjectDetail.tsx - detaljsida med flikar
- largeProjectService.ts - komplett API för alla CRUD-operationer
- largeProject.ts - TypeScript-typer
- Route `/large-project/:id` tillagd

### Återstår

#### Fas 4: Avancerade funktioner
- [ ] Aggregerad ekonomi (visa kostnader från alla bokningar)
- [ ] Kommentarsfunktion för stora projekt
- [ ] Filuppladdning för stora projekt
- [ ] Gemensam personalhantering
- [ ] Samordnad logistik/transport

## Arkitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJEKTHANTERING (/projects)                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ Projekt litet   │ Projekt medel   │ Projekt stort               │
│ (jobs)          │ (projects)      │ (large_projects)            │
│ 1 bokning       │ 1 bokning       │ N bokningar                 │
│ Enkel struktur  │ Full hantering  │ Mässor, samordning          │
└─────────────────┴─────────────────┴─────────────────────────────┘

Nya bokningar (IncomingBookingsList):
[Litet] [Medel] [Stort] - tre knappar för att välja projekttyp
```

## Tekniska filer

### Nya filer skapade:
- `src/types/largeProject.ts`
- `src/services/largeProjectService.ts`
- `src/pages/LargeProjectDetail.tsx`
- `src/components/project/LargeProjectsListPanel.tsx`

### Ändrade filer:
- `src/pages/ProjectManagement.tsx` - tre-kolumns layout
- `src/components/project/JobsListPanel.tsx` - namnbyte
- `src/components/project/IncomingBookingsList.tsx` - tre knappar
- `src/pages/JobDetail.tsx` - namnbyte
- `src/App.tsx` - ny route

## Databas

### Tabeller:
- `large_projects` - huvudtabell
- `large_project_bookings` - koppling projekt ↔ bokningar
- `large_project_tasks` - uppgifter
- `large_project_files` - filer
- `large_project_comments` - kommentarer
- `large_project_purchases` - inköp
- `large_project_budget` - budget
