
## Fix: Stoppa gamla bokningar fran att aterimporteras

### Grundorsak

Datumfiltret i `import-bookings` fungerar inte. Funktionen `hasFutureDates()` kollar faltnamnen `rigdaydate`, `eventdate`, `rigdowndate` -- men det externa API:et skickar datum som:
- `rig_up_dates` (array)
- `event_dates` (array)  
- `rig_down_dates` (array)

Alla tre falten blir `undefined`, datumslistan blir tom, och funktionen returnerar `true` (tillat import). Resultatet: **alla bokningar fran API:et importeras oavsett datum**, inklusive bokningar fran 2019, 2022, 2024 etc. Varje gang synken kor ateruppstar alla raderade bokningar och deras packningsprojekt.

### Losning (2 steg)

#### Steg 1: Fixa datumfiltret i `import-bookings`

Uppdatera `hasFutureDates()` sa den laser ratt faltnamn fran det externa API:et:

```typescript
const hasFutureDates = (booking: any): boolean => {
  // External API sends dates as arrays: rig_up_dates, event_dates, rig_down_dates
  // Also check legacy field names for safety
  const allDates: string[] = [];
  
  // Array format from external API
  if (Array.isArray(booking.rig_up_dates)) allDates.push(...booking.rig_up_dates);
  if (Array.isArray(booking.event_dates)) allDates.push(...booking.event_dates);
  if (Array.isArray(booking.rig_down_dates)) allDates.push(...booking.rig_down_dates);
  
  // Legacy field names (fallback)
  if (booking.rigdaydate) allDates.push(booking.rigdaydate);
  if (booking.eventdate) allDates.push(booking.eventdate);
  if (booking.rigdowndate) allDates.push(booking.rigdowndate);
  
  const validDates = allDates.filter(Boolean);
  if (validDates.length === 0) return true; // No dates = allow
  
  return validDates.some(dateStr => new Date(dateStr) >= CUTOFF_DATE);
};
```

#### Steg 2: Rensa databasen

Radera alla bokningar och deras kopplad data utom 2602-2 och 2602-4. Skillnaden fran tidigare forsok:

1. Disabla ALLA triggers pa bookings-tabellen (inte bara en specifik)
2. Radera i ratt ordning med alla beroenden
3. Deployen av den fixade edge-funktionen FORE rensningen, sa att synken inte aterimporterar gamla bokningar vid nasta korning

Raderingordning:
```text
packing_task_comments -> packing_tasks -> packing_list_items -> packing_parcels
-> packing_comments -> packing_files -> packing_labor_costs -> packing_purchases 
-> packing_invoices -> packing_quotes -> packing_budget -> packing_projects
-> calendar_events -> warehouse_calendar_events -> transport_assignments -> time_reports
-> booking_products -> booking_changes -> projects -> bookings (triggers disabled)
```

### Filer som andras

| Fil | Andring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Fixa `hasFutureDates()` att lasa ratt API-faltnamn |
| Databasmigrering | Radera alla bokningar/packningar utom 2602-2 och 2602-4 |

### Forväntat resultat

- Bara 2 bokningar kvar i systemet (2602-2 och 2602-4)
- Bara 2 packningsprojekt (kopplade till dessa bokningar)  
- Nasta sync importerar INTE gamla bokningar (datumfiltret fungerar)
- Nya bokningar med datum >= 2026-01-01 importeras som vanligt
