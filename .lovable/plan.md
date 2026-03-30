

## Bokningskopplade aktiviteter i stora projektets Gantt-schema

### Problem
I det stora projektets Gantt-schema kan man bara skapa generella aktiviteter. Man kan inte:
1. Se vilka bokningar som finns i projektet och skapa bygg/riv-aktiviteter per bokning
2. Snabblägga produkter från en specifik bokning som todos
3. Länka en aktivitet till rätt bokning

### Lösning

#### 1. Utöka `AddEstablishmentTaskDialog` med bokningsväljare (stor projektvy)
- Hämta alla bokningar i projektet via `project.bookings`
- Visa en **bokningsväljare** (dropdown/lista) överst i dialogen när `largeProjectId` finns
- När en bokning väljs:
  - Hämta bokningens produkter via `fetchEstablishmentBookingData(bookingId)`
  - Visa snabbval-knappar för varje produkt (samma som för medelstora projekt)
  - Skapade tasks får både `large_project_id` OCH `booking_id` satt
- Manuellt skapade tasks kan valfritt kopplas till en bokning

#### 2. Visa bokningskoppling i Gantt-schemat
- I task-label-kolumnen, visa en liten badge/text med bokningens klientnamn om tasken har `booking_id`
- Gruppera eller markera tasks visuellt per bokning

#### 3. Skicka bokningsdata till dialogen
- `LargeEstablishmentPage` skickar `project.bookings` till `EstablishmentGanttChart`
- `EstablishmentGanttChart` skickar vidare till `AddEstablishmentTaskDialog`

#### 4. Task detail sheet — visa kopplad bokning
- I `EstablishmentTaskDetailSheet`, visa vilken bokning en task tillhör (om någon)

### Filer att ändra
- **`src/components/project/AddEstablishmentTaskDialog.tsx`** — Lägg till bokningsväljare, hämta produkter per vald bokning, sätt `booking_id` på skapade tasks
- **`src/components/project/EstablishmentGanttChart.tsx`** — Ta emot `bookings` prop i projektläge, skicka vidare till dialog, visa bokningsnamn i task-labels
- **`src/pages/project/LargeEstablishmentPage.tsx`** — Skicka `project.bookings` till Gantt-komponenten
- **`src/components/project/EstablishmentTaskDetailSheet.tsx`** — Visa kopplad bokning
- **`src/services/establishmentTaskService.ts`** — Säkerställ att `booking_id` stöds i kombination med `large_project_id`

### Flöde
```text
Användare klickar "Lägg till aktivitet" i Gantt
  → Väljer bokning ur dropdown (visar alla projektets bokningar)
  → Ser produkter från den bokningen som snabbval
  → Klickar på en produkt → task skapas med large_project_id + booking_id
  → I Gantt-schemat visas tasken med bokningens namn som badge
```

