# Plan

## Vad jag hittade
Den gamla geofencen kommer tillbaka därför att GPS-kartan nu laddar **alla aktiva projekt** via `useAllActiveProjectGeofences`, men den hooken filtrerar fel statusfält.

För Westmans i Skokloster finns just nu två projektrader på nästan samma punkt:
- `5c3fd6fd-79cd-488e-ae86-5d9677e3bdb0` — **cancelled**
- `b6f0ba67-6a82-4925-9ddc-d5212d0e4981` — **planning** med radius 350

Den cancelled-raden kommer med på kartan trots att den ska bort. Därför ser du gamla/orimliga dubbla geofences och popupen kan hamna på fel rad.

## Jag kommer att ändra
1. Rätta statusfiltreringen i `useAllActiveProjectGeofences` så att projekt med `status='cancelled'` eller `planning_status='cancelled'` aldrig kommer med.
2. Lägga till deduplicering för projekt på samma plats/samma bookingfamilj så att gamla och nya rader inte kan ritas ovanpå varandra om de ändå råkar passera filtret.
3. Lägga till test som låser beteendet: cancelled projekt ska inte ge geofence, och bara den giltiga Westmans-raden ska finnas kvar.
4. Verifiera i preview och köra riktade vitest efter ändringen.

## Tekniska detaljer
- Jag bryter ut filtreringen till en liten ren helper så den går att testa utan UI.
- Deduplicering prioriterar giltig/aktiv projektrad före cancelled/äldre rad.
- Ingen databasmigration behövs; detta är ren frontend-läslogik.

## Förväntat resultat
- Den gamla geofencen försvinner.
- Bara den aktuella Westmans-geofencen visas på platsen.
- Kartpopupen slutar hoppa mellan gamla och nya projektrader.