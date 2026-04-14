

## Restid kopplad till destinationsprojekt i tidrapporter

### Regel
- Resa från Lager → Projekt 1: restid tillhör **Projekt 1** (destination)
- Resa från Projekt 2 → Projekt 3: restid tillhör **Projekt 3** (destination)  
- Resa från Projekt 3 → Lager (dag slut): restid tillhör **Projekt 3** (senaste projektet, ingen ny destination)

### Ändringar

| Fil | Ändring |
|-----|---------|
| **`mobile-app-api/index.ts`** (stopTravel) | Förbättra destination-matchning: om GPS-match hittas → `destination_booking_id` som idag. Om **ingen** match hittas (t.ex. åker hem/lager) → sätt `destination_booking_id` till den senast aktiva timerens `booking_id` för denna personal (hämta från `time_reports` senaste samma dag) |
| **`StaffTimeReportDetail.tsx`** | Hämta `travel_time_logs` parallellt med `time_reports` för samma staff+månad. Joina med `bookings` via `destination_booking_id` för att visa kundnamn. Visa reserader med 🚗-ikon och blå "Resa"-badge. Summera i totalen med separat "varav restid"-rad |
| **`StaffTimeReports.tsx`** (översikt) | Inkludera `travel_time_logs.hours_worked` i `total_hours_this_month` per personal |
| **`mobile-app-api/index.ts`** (getTimeReports) | Returnera `travel_logs` parallellt med `time_reports` så mobilappen också kan visa restid |

### Destinationslogik i backend (stopTravel)

```text
1. GPS-match inom 300m → destination_booking_id = matchad bokning ✓ (redan idag)
2. Ingen GPS-match → hämta senaste time_report samma dag för denna staff
   → destination_booking_id = den bokningens booking_id
   (= "sista projektet jag jobbade på innan jag åkte")
```

### UI i admin-tidrapporter

```text
Datum       Kund/Typ              Start  Slut   Timmar
mån 14 apr  Kund AB #2603         08:00  15:00  7:00
mån 14 apr  🚗 Resa → Kund CD    15:05  15:45  0:40
mån 14 apr  Kund CD #2604         16:00  20:00  4:00
mån 14 apr  🚗 Resa → Kund CD    20:05  20:35  0:30
            ─────────────────────────────────────
            TOTALT                               12:10
            varav restid                         1:10
```

- Reserader visas med `Car`-ikon, blå badge, och "→ Kundnamn" som destination
- Om ingen destination matchades visas "🚗 Resa" utan destination
- Reserader har ingen övertid eller godkännande-status

### Teknisk implementation

**StaffTimeReportDetail.tsx** — utökad query:
```typescript
// Ny parallell query
const { data: travelData } = await supabase
  .from('travel_time_logs')
  .select('id, report_date, start_time, end_time, hours_worked, destination_booking_id, from_address, to_address')
  .eq('staff_id', staffId)
  .gte('report_date', monthStart)
  .lte('report_date', monthEnd)
  .not('end_time', 'is', null);

// Hämta kundnamn för destinationer
const bookingIds = travelData?.map(t => t.destination_booking_id).filter(Boolean);
const { data: destBookings } = await supabase
  .from('bookings')
  .select('id, client')
  .in('id', bookingIds);

// Mappa till samma radformat med type: 'travel'
// Merge + sortera på start_time
```

**StaffTimeReports.tsx** — summera restid i månadstotaler:
```typescript
const { data: travelReports } = await supabase
  .from('travel_time_logs')
  .select('staff_id, hours_worked')
  .gte('report_date', monthStart)
  .lte('report_date', monthEnd)
  .not('end_time', 'is', null);
// Addera till monthlyByStaff.totalHours
```

### Vad som INTE ändras
- `travel_time_logs`-tabellen behålls som den är (har redan alla nödvändiga kolumner)
- Restid räknas inte som övertid
- Godkännande gäller bara vanliga tidrapporter

