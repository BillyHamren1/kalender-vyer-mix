## Problem

"Medel"-knappen på en inkommande bokning (både i Planeringsdashboard och Projekthantering) öppnar **`CreateTodoWizard`** istället för **`CreateProjectWizard`**. Det är därför du fick dialogen "Skapa to do" när du försökte skapa ett medelstort projekt från Niklas Viking Production AB-bokningen.

## Var felet ligger

- `src/pages/PlanningDashboard.tsx` (rad 204): `<CreateTodoWizard ... />` är monterad och öppnas av `handleCreateProject` (Medel-knappen).
- `src/pages/ProjectManagement.tsx` (rad 242): samma fel — Medel-knappen från `IncomingBookingsList` öppnar `CreateTodoWizard`.
- Den korrekta komponenten finns redan: `src/components/project/CreateProjectWizard.tsx` accepterar samma `preselectedBookingId`-prop.

I `ProjectManagement.tsx` används `CreateTodoWizard` även av den separata "Skapa to do"-knappen i headern (rad 173–179) — där är det rätt. Men samma state (`isCreateOpen` / `selectedBookingId`) återanvänds för båda flödena, vilket är roten till blandningen.

## Fix

### 1. `src/pages/PlanningDashboard.tsx`
- Byt importen `CreateTodoWizard` → `CreateProjectWizard`.
- Byt `<CreateTodoWizard ... />` (rad 204) mot `<CreateProjectWizard ... />` med samma props.

### 2. `src/pages/ProjectManagement.tsx`
Behåll båda wizards men separera state:
- Lägg till nya state-variabler: `isCreateProjectOpen` + `createProjectBookingId` för Medel-flödet (CreateProjectWizard).
- Behåll `isCreateOpen` + `selectedBookingId` för "Skapa to do"-knappen (CreateTodoWizard).
- `handleCreateProject(bookingId)` (rad 136) sätter `isCreateProjectOpen = true` och `createProjectBookingId = bookingId`.
- Headern "Skapa to do"-knappen (rad 173) öppnar `isCreateOpen` (oförändrat).
- Montera båda dialogerna nedanför varandra i JSX.

### 3. Verifiering
- Vitest-test som mockar `IncomingBookingsList`/`DashboardNewBookings` och klickar "Medel" → asserterar att `CreateProjectWizard` (inte `CreateTodoWizard`) renderas med rätt `preselectedBookingId`.
- Vitest-test som klickar "Skapa to do" i `ProjectManagement` headern → asserterar att `CreateTodoWizard` öppnas (utan booking).
- Kör `lovable-exec test` efter ändringarna.

### 4. Manuell preview-verifiering
Klicka "Medel" på Niklas Viking-bokningen i Planeringsdashboard → bekräfta att projekt-wizarden öppnas, inte to-do-dialogen.

## Påverkas inte
- "Litet" (createJobMutation) — orörd.
- "Stort" (AddToLargeProjectDialog) — orörd.
- "Skapa to do"-knappen i ProjectManagement-headern — fortsätter öppna `CreateTodoWizard`.
- Inga schema- eller backend-ändringar.