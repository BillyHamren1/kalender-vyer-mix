# Plan: återställ bara start/slut

## Mål
Återställa den tidigare korrekta beräkningen av dagens starttid och sluttid i GPS-vyn, utan att ändra någon logik för hem/private eller hur övriga segment klassificeras.

## Vad som ändras
1. Identifiera exakt var `firstIso` och `lastIso` började styras av den nya partition-logiken.
2. Ändra week summary så start/slut åter kommer från samma källa som tidigare, medan övrig nuvarande logik lämnas orörd.
3. Säkerställa att UI-raden visar de återställda start/sluttiderna men i övrigt inte får någon beteendeförändring.
4. Lägga till ett regressions-test som låser att start/slut inte påverkas av partitionering eller klassificering.

## Tekniska ändringar
- `supabase/functions/get-staff-gps-week-summary/index.ts`
  - Återställ `firstIso` och `lastIso` till den tidigare datakällan för dagsfönstret i stället för att låta partitioneringen definiera dem.
- Eventuellt berörd shared helper i staff GPS-kedjan
  - Endast om det behövs för att exponera den ursprungliga start/slut-källan tydligt.
- `src/hooks/staff/useStaffGpsWeekSummary.ts`
  - Behåll kontraktet, men säkerställ att hooken tar de återställda värdena utan extra tolkning.
- Test
  - Lägg till/uppdatera test som uttryckligen verifierar att start/slut är återställda och inte ändras av segmentlogiken.

## Oförändrat
- Ingen ändring av hem/private.
- Ingen ändring av arbets-/warehouse-prioritering.
- Ingen ändring av segmenttyper eller hur tiden mellan start/slut visas.

## Validering
1. Köra riktade tester för GPS day summary/partition.
2. Verifiera i preview att dagen visar samma start/slut som före partition-ändringen.