

## Problem

Den retroaktiva migreringen skapade de samlade packlistorna men satte **inte** `start_date` och `end_date` på dem. Alla 5 stora projekt hamnar därför i "Ej schemalagda" längst ner i kalendern istället för att visas som staplar.

Bokningarna har datumen:
- Tiomila: 26 apr – 4 maj
- Seniordagen: 4–5 maj
- Seniordagen Norrtälje: 11–12 maj  
- Swedish Game Fair: 25 maj – 1 jun
- Eken Cup: 8–16 jun

## Plan

**1. Migration: Populera start_date/end_date på samlade packlistor**

Kör en enkel UPDATE som sätter `start_date` = tidigaste `rigdaydate` och `end_date` = senaste `rigdowndate` från de kopplade bokningarna via `packing_project_bookings`.

```sql
UPDATE packing_projects pp
SET start_date = sub.min_rig,
    end_date = sub.max_rigdown
FROM (
  SELECT ppb.packing_id,
         min(b.rigdaydate::date) as min_rig,
         max(b.rigdowndate::date) as max_rigdown
  FROM packing_project_bookings ppb
  JOIN bookings b ON b.id = ppb.booking_id
  GROUP BY ppb.packing_id
) sub
WHERE pp.id = sub.packing_id
  AND pp.large_project_id IS NOT NULL
  AND pp.start_date IS NULL;
```

**2. Uppdatera `handleCreateCombinedPacking` i IncomingPackingList.tsx**

Säkerställ att nya samlade packlistor automatiskt beräknar `start_date`/`end_date` från bokningarna vid skapande, så att samma problem inte uppstår igen.

### Filer som ändras
- Ny migration (datapopulering)
- `src/components/packing/IncomingPackingList.tsx` — beräkna datum vid skapande

