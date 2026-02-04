
# Konsolidera Gantt-steg: Ta bort "Byggnation"

## Sammanfattning
Minskar antalet Gantt-steg från 4 till 3 genom att ta bort "Byggnation" som separat fas, eftersom det är samma sak som "Etablering".

## Nya steg

| Steg | Namn | Typ |
|------|------|-----|
| 1 | Etablering | Arbetsperiod |
| 2 | Event | Milstolpe |
| 3 | Avetablering | Arbetsperiod |

## Ändringar

### 1. LargeProjectGanttSetup.tsx
Uppdatera `DEFAULT_STEPS` konstanten:

```typescript
const DEFAULT_STEPS = [
  { key: 'establishment', name: 'Etablering', is_milestone: false },
  { key: 'event', name: 'Event', is_milestone: true },
  { key: 'deestablishment', name: 'Avetablering', is_milestone: false },
];
```

### 2. LargeProjectGanttChart.tsx
Uppdatera `STEP_COLORS` om det finns referens till 'construction':

```typescript
const STEP_COLORS: Record<string, string> = {
  establishment: 'bg-blue-500',
  event: 'bg-purple-500',
  deestablishment: 'bg-orange-500',
};
```

### 3. Befintlig data i databasen
Om det finns stora projekt som redan har sparat "construction"-steg behöver dessa hanteras. Alternativ:
- Migrera befintliga "construction"-poster till "establishment"
- Eller låta gammal data vara kvar (systemet visar bara de steg som finns)

## Tekniska detaljer
- Ändra `DEFAULT_STEPS` array i `LargeProjectGanttSetup.tsx` rad 28-33
- Uppdatera eventuella färgmappningar i `LargeProjectGanttChart.tsx`
- Valfritt: Skapa databasmigration för att rensa gamla 'construction'-poster
