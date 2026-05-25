## Mål
Återställa så att veckolistan, inline-kartan och detaljkartan visar samma underlag för samma person/dag — utan extra "smart" omtolkning — och att platsnamnet speglar faktisk matchad plats i stället för fel projektnamn.

## Jag kommer att göra
1. Göra detaljkartan och veckolistan helt datamässigt identiska
   - Ta bort den extra sammanslagningen med `useAllActiveProjectGeofences` i detaljkartan.
   - Låta detaljkartan visa exakt samma snapshot-geofences och visits som `get-mobile-staff-day-pings` returnerar.
   - Säkerställa att batch-endpointen fortsätter bygga sin summary från samma delade `buildVisits`-logik som dags-snapshoten.

2. Rätta platsetiketten så den visar faktisk matchad plats
   - Gå igenom hur `loadOrgGeofences` sätter `name` för project/booking/large-project fences.
   - Justera prioriteten så visad label blir den verkliga platsen/venue-adressen när sådan finns, i stället för att bara visa projektnamn som t.ex. "Tavet" när GPS-spåret matchar Handelsbanken.
   - Behålla statusregeln: endast bekräftade bokningar får vara datumstyrda kända platser.

3. Låsa datum- och matchningsregeln så inget annat smyger in igen
   - Säkerställa att per-dag-matchning bara använder dagens giltiga confirmed targets + fasta platser.
   - Ingen separat "alla aktiva projekt"-källa får påverka vad användaren ser i GPS-satellitvyn.

4. Verifiera med tester
   - Uppdatera/lägga till tester för att fånga:
     - samma dagdata i batch vs dags-snapshot
     - att fel extra project-geofences inte kan läcka in i detaljkartan
     - att etiketten blir plats/venue och inte fel projektnamn när bokningens plats skiljer sig från projektets namn

## Resultat efter ändringen
- Om Markus GPS visar att han varit vid en annan plats än warehouse, ska lista och karta visa samma sak.
- Om matchningen gäller Handelsbanken ska raden inte stå som Tavet bara för att projektet heter så internt.
- UI och layout kan skilja sig, men inte själva innehållet.

## Tekniska detaljer
- Filer som sannolikt ändras:
  - `src/components/staff/StaffGpsSatelliteMap.tsx`
  - `supabase/functions/_shared/staff-gps/buildVisits.ts`
  - eventuellt `supabase/functions/get-staff-gps-week-summary/index.ts`
  - relevanta tester under `src/hooks/staff/__tests__/...` och/eller `src/test/...`
- Validering:
  - köra riktade tester för GPS-vecko/batch
  - kontrollera i preview att lista, inline-karta och detaljkarta för samma dag matchar visuellt och datamässigt