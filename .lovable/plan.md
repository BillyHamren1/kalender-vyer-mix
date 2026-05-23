## Mål
Se till att privata boenden som `Boende - Vällsta` aldrig visas i geofence-/platslistan på `/staff-management/gps-satellite-map`.

## Det som faktiskt är fel
- Veckosammanfattningen har redan en privatfilter-logik (`privateIds`) och texten säger uttryckligen att boende inte räknas.
- Den stora dagslistan i `StaffGpsSatelliteMap` använder däremot snapshotens `visits` direkt utan att filtrera bort privata boenden.
- Därför läcker hem/plats av typen `private_residence` in i tabellen trots att de inte ska visas.

## Plan
### 1. Identifiera privata geofences i dagsvyn
- Läsa in samma signal som redan används i veckosammanfattningen:
  - `organization_locations.is_private_residence`
  - `location_type === 'private_residence'`
- Mappa dessa till ett set av privata `loc:<id>` för aktuell vy.

### 2. Filtrera bort privata besök innan tabellen renderas
- Stoppa `Boende - Vällsta` och andra privata boenden från att nå `GeofenceVisitsTable`.
- Låta övriga arbetsplatser/projekt/lager ligga kvar oförändrat.

### 3. Hålla admin och mobil konsekventa
- Säkerställa att samma privata filter används även där snapshotdata återanvänds för mini-map/listliknande visningar, så att hem inte kan dyka upp i en vy men inte i en annan.

### 4. Lägga regressionstester
- Test som verifierar att `loc:<id>` med privat boende filtreras bort från dagslistan.
- Test som verifierar att vanliga platser/lager/projekt fortfarande visas.

### 5. Verifiera direkt efter ändring
- Köra riktade vitest-tester.
- Kontrollera i preview att `Boende - Vällsta` inte längre syns i listan.

## Tekniska detaljer
Berörda filer blir sannolikt:
- `src/components/staff/StaffGpsSatelliteMap.tsx`
- ev. gemensam filter/helper om logiken ska återanvändas
- relevanta testfiler för GPS-listan

## Förväntat resultat
- `Boende - Vällsta` försvinner helt från listan.
- Arbetsplatser/projekt/lager visas fortsatt normalt.
- Regeln "Boende räknas inte" blir sann även i dagsvyn.