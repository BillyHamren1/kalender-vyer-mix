## Mål
Lägg till en knapp i Geofence-besök-panelen på `/staff-management/gps-satellite-map` som visar **alla** pings för hela den valda dagen (inte bara per besök).

## Var
`src/components/staff/StaffGpsSatelliteMap.tsx` — `GeofenceVisitsTable`-headern (där det idag står "Klicka på en rad för att se alla pings").

## Vad
1. Skicka in dagens fullständiga pings (`snapshotQuery.data?.pings`) till `GeofenceVisitsTable` som ny prop `allDayPings`.
2. Lägg till en knapp "Visa alla pings för dagen ({n})" i panelens header bredvid räknaren.
3. När den klickas, expanderas en sektion under tabellen (eller överst) som återanvänder samma render-tabell som `VisitPingsDetail` — ren ping-lista (#, Tid, Lat, Lng, Acc, Karta) med max-höjd + scroll.
4. State `showAllPings` lokalt i `GeofenceVisitsTable`. Toggle visar/döljer.
5. Refaktorera ping-tabellen i `VisitPingsDetail` till en liten intern komponent `PingsTable` som tar `pings: StaffGpsSnapshotVisitPing[]` (eller motsvarande shape), så både besök-detalj och dag-vyn delar exakt samma rendering.

## Ingen ändring av datalogik
- Inga nya queries — pings finns redan i `snapshotQuery.data.pings` (samma snapshot som kartan).
- Påverkar inte Single Source-policyn, snapshot-cachen eller `known-sites-date-bound`-regeln.
- Inga edge functions, ingen DB-ändring.

## Filer
- `src/components/staff/StaffGpsSatelliteMap.tsx` (edit)