

## Korrigera Raivis dubbelräknade tid

### Rotorsak

Raivis har en **felaktig time_report** (id `0e25aeef`) som refererar till Lager-bokningen (`6fd6e6da`) men har exakt samma tider som Westmans-posten (08:22→11:20, 2.97h). Denna rad ska inte finnas — den dubbelräknar nästan 3 timmar.

Dessutom finns ett systemiskt problem i `StaffTimeReports.tsx`: **total_hours summerar time_reports + location_time_entries utan att exkludera skuggade (duplicerade) poster**. Segment-dedupen (rad 279) förhindrar att dubbla rader *visas*, men `total_hours` på rad 256 läggs till *innan* dedup-kontrollen.

### Åtgärder

**1. Ta bort den felaktiga time_report-raden**

Radera `time_report` med id `0e25aeef-b1c7-4ba0-a311-0bc42bf1d43b` — det är en dubblettpost med fel booking-koppling som ger +2.97h extra.

```sql
DELETE FROM time_reports WHERE id = '0e25aeef-b1c7-4ba0-a311-0bc42bf1d43b';
```

**2. Fixa total_hours-beräkningen i StaffTimeReports.tsx**

Flytta `a.total_hours += r.hours_worked` så att den bara körs om raden **inte** skuggas av en location_time_entry. Idag läggs timmar till på rad 256 innan skugg-kontrollen på rad 279.

Ändring i `src/pages/StaffTimeReports.tsx`, ca rad 254-296:
- Flytta `total_hours`-adderingen till EFTER `isReportShadowedByLTE`-kontrollen
- Om en time_report skuggas av en LTE, hoppa över den helt (inklusive hours)

### Resultat efter korrigering

| Källa | Timmar |
|---|---|
| time_reports (utan dublett) | 0.32 + 2.97 + 0.50 = 3.79h |
| location_time_entries | 0.32 + 2.97 + 0.50 + ~3.2h (pågår) = ~7.0h |
| travel | 1.10h |
| **Deduplicerat totalt** | ~8.1h (korrekt vid 14:40) |

Med den fixade beräkningslogiken räknas bara location_time_entries för poster som finns i båda tabellerna, och resor läggs till separat.

