
# Plan: Fixa veckonavigering på Dashboard

## Problem

Dashboardens veckovy visar **inga jobb** när du navigerar till vecka 5, trots att bokningar finns för 29-30 januari.

### Grundorsak

Det finns en **disconnect** mellan:
1. **WeekProjectsView** komponenten som har lokal `useState` för `currentWeekStart` och tillåter navigering mellan veckor
2. **fetchWeekProjects** i servicen som ALLTID hämtar data för den **aktuella veckan** (baserat på `new Date()`)

När du klickar "föregående vecka" uppdateras UI:t för att visa vecka 5:s dagar, men data-fetchen fortsätter att hämta vecka 6:s bokningar. Resultatet: inga matchningar, alla dagar visar "Inga jobb".

```text
┌─────────────────────────────────────────────────────────────┐
│  WeekProjectsView                                           │
│  ┌─────────────────┐                                        │
│  │ currentWeekStart│ ← navigerar till vecka 5               │
│  │ (useState)      │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  Renderar dagar för vecka 5 (26-30 jan)                     │
│           │                                                 │
│           │  Men filtrerar projekten mot:                   │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ projects prop   │ ← Data för vecka 6 (från hooken)       │
│  │ (från parent)   │                                        │
│  └─────────────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  isSameDay(project.date, vecka5dag) = false för alla!       │
│           │                                                 │
│           ▼                                                 │
│  "Inga jobb" visas överallt                                 │
└─────────────────────────────────────────────────────────────┘
```

## Lösning

Koppla ihop `currentWeekStart` med data-fetchen så att rätt veckas data hämtas.

### Tekniska ändringar

| Fil | Ändring |
|-----|---------|
| `src/services/planningDashboardService.ts` | Uppdatera `fetchWeekProjects` att ta emot `weekStart: Date` parameter |
| `src/hooks/usePlanningDashboard.tsx` | Lägg till `currentWeekStart` som parameter och inkludera i query key |
| `src/pages/PlanningDashboard.tsx` | Flytta vecko-state hit och skicka ner till både hook och komponent |
| `src/components/planning-dashboard/WeekProjectsView.tsx` | Ta emot `weekStart` och navigeringsfunktioner som props istället för lokal state |

### Detaljerad implementation

#### 1. Servicen (planningDashboardService.ts)

```typescript
// Ändra från:
export const fetchWeekProjects = async (): Promise<WeekProject[]> => {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  ...
}

// Till:
export const fetchWeekProjects = async (weekStart: Date): Promise<WeekProject[]> => {
  // Nu använder parametern istället för new Date()
  ...
}
```

#### 2. Hooken (usePlanningDashboard.tsx)

```typescript
export const usePlanningDashboard = (currentWeekStart: Date) => {
  // ...
  
  const weekProjectsQuery = useQuery<WeekProject[]>({
    queryKey: ['planning-dashboard', 'week-projects', format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: () => fetchWeekProjects(currentWeekStart),
    refetchInterval: 30000,
  });
  
  // ...
}
```

#### 3. Dashboard-sidan (PlanningDashboard.tsx)

```typescript
const PlanningDashboard = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  
  const { weekProjects, ... } = usePlanningDashboard(currentWeekStart);
  
  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  
  return (
    <WeekProjectsView 
      projects={weekProjects}
      weekStart={currentWeekStart}
      onPreviousWeek={goToPreviousWeek}
      onNextWeek={goToNextWeek}
      ...
    />
  );
}
```

#### 4. WeekProjectsView (ta bort lokal state)

```typescript
interface WeekProjectsViewProps {
  projects: WeekProject[];
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  isLoading: boolean;
  onStaffDrop: ...
}

const WeekProjectsView = ({ 
  projects, 
  weekStart,  // Nu från parent
  onPreviousWeek, 
  onNextWeek,
  ... 
}: WeekProjectsViewProps) => {
  // Ta bort useState för currentWeekStart
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  ...
}
```

## Resultat

Efter implementation:
- Veckonavigering hämtar rätt data för vald vecka
- Vecka 5 visar bokningarna för 29-30 januari
- Query key inkluderar vecko-start, så TanStack Query cachar per vecka
- Fullt reaktivt: navigera fram/tillbaka och data uppdateras automatiskt
