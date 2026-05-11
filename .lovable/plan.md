# Plan

## Problem
Mobilens `/m/report` faller inte på tidsberäkningen just nu, utan på nätverkslagret: `get-staff-day-status` svarar inte på browserns preflight när `x-view-as-staff` skickas. Därför blir resultatet `Failed to fetch`, och `TodayTab`/dagsdetaljen får ingen snapshot alls.

## Vad jag kommer att ändra
1. Uppdatera `supabase/functions/get-staff-day-status/index.ts` så dess CORS-huvuden matchar de andra snapshot-funktionerna och explicit tillåter `x-view-as-staff`.
2. Säkerställa att funktionen fortsatt använder samma snapshot-only-regel och inte inför någon lokal fallback i frontend.
3. Verifiera att `/m/report` i read-only/view-as-läge åter kan hämta dagssnapshot utan `Failed to fetch`.

## Teknisk detalj
- Felorsaken är att `get-staff-day-status` idag har:
  - `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
- medan övriga snapshot-funktioner redan tillåter:
  - `..., x-view-as-staff`
- Frontenden skickar redan `x-view-as-staff` via `callStaffSnapshotFunction`, så browsern stoppar anropet innan Edge Function körs.

## Validering
- Bekräfta att nätverksanropet till `get-staff-day-status` inte längre får `Failed to fetch`.
- Bekräfta att `/m/report` laddar dagsdata i view-as-läge.
- Ingen ändring av tidslogik eller lokala summeringar görs i detta steg.