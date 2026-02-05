

## Fixa kalender-sidans prestanda

### Identifierade problem

**Problem 1: N+1 Query-problem vid event-laddning**
- `useRealTimeCalendarEvents.tsx` gör 575 separata Supabase-anrop (ett per kalender-event) för att hämta bokningsdetaljer
- Nuvarande kod: `await Promise.all(calendarEvents.map(async (event) => { await supabase.from('bookings')... }))`
- Detta tar extremt lång tid och överbelastar databasen

**Problem 2: Duplicerade getStaffForTeamAndDate-anrop**
- Funktionen anropas 77+ gånger per rendering (11 team × 7 dagar)
- Loggarna visar att samma anrop görs flera gånger

### Lösning

#### 1. Ersätt N+1 queries med batch-hämtning
Istället för att hämta en bokning i taget, samla alla booking IDs och gör EN query:

```typescript
// FÖRE (575 queries):
const enhancedEvents = await Promise.all(
  calendarEvents.map(async (event) => {
    const { data: booking } = await supabase
      .from('bookings')
      .eq('id', event.bookingId)
      .single();
  })
);

// EFTER (2 queries):
const bookingIds = calendarEvents
  .filter(e => e.bookingId)
  .map(e => e.bookingId);

const { data: bookings } = await supabase
  .from('bookings')
  .select('id, client, booking_number, ...')
  .in('id', bookingIds);

const bookingMap = new Map(bookings.map(b => [b.id, b]));

const enhancedEvents = calendarEvents.map(event => ({
  ...event,
  extendedProps: { ...bookingMap.get(event.bookingId) }
}));
```

#### 2. Memoize getStaffForTeamAndDate
Lägg till memoization så att upprepade anrop med samma teamId+date returnerar cachad data:

```typescript
const memoizedGetStaff = useMemo(() => {
  const cache = new Map<string, StaffMember[]>();
  return (teamId: string, date: Date) => {
    const key = `${teamId}-${format(date, 'yyyy-MM-dd')}`;
    if (cache.has(key)) return cache.get(key)!;
    const result = // ... original logic
    cache.set(key, result);
    return result;
  };
}, [assignments]);
```

### Tekniska filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/hooks/useRealTimeCalendarEvents.tsx` | Ersätt N+1 queries med batch-hämtning via `.in()` |
| `src/hooks/useUnifiedStaffOperations.tsx` | Lägg till memoization för getStaffForTeamAndDate |

### Förväntad förbättring
- **Före**: 575+ Supabase-anrop vid sidladdning (~10-30 sekunder)
- **Efter**: 2-3 Supabase-anrop (~0.5-1 sekund)
- Laddningstiden bör minska med **95%+**

