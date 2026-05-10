
## Förord (läs först)

**1) Tidszon — du har rätt.** All read-only-rapportering, decision trace, health-check och drawer-text ska visa **Europe/Stockholm**. Jag ska skriva en liten helper `formatStockholm(ts)` (`HH:MM` + ev. `YYYY-MM-DD`) i `supabase/functions/_shared/timeline/geo.ts` (eller bredvid) och byta ut alla `toISOString()`/UTC-strängar i:
- `report-candidate-blocks-health/index.ts` (response-fält + examples)
- `DecisionTraceDrawer.tsx`
- alla nya geoAnchor-fält i denna plan

UTC behålls bara internt vid jämförelser — aldrig i text mot dig.

**2) Faktum från databasen 2026-05-09 (Armands, lokaltid):**
- `assistant_events`: **endast** `departure` från FA Warehouse 04:05:10 (geofence_foreground). **Ingen arrival på GOPA registrerad.**
- `staff_presence_events`: **0 rader** (tabellen finns men används inte ännu).
- `arrival_prompt_log`: 0 rader.

Det betyder: även med en perfekt geo-entry-anchor skulle GOPA-arrivalen inte ha låst Armands till projektet — för det finns ingen geo entry-händelse för GOPA i datat. **Mobilappens auto-arrival skickade aldrig event.** Det ligger utanför scopet (du sa: ingen mobilapp), men det är därför sticky/stationary-logiken är så viktig som komplement.

Planen levererar därför **både** geo-anchor-stödet (när events finns) **och** håller kvar sticky som fallback — strikt server-only, inga writes, ingen AI, inga rådata-ändringar.

## Plan

### Steg 0 — Stockholm-tid överallt

Helper i `supabase/functions/_shared/timeline/geo.ts`:
```text
formatStockholm(iso) -> "HH:MM" eller "YYYY-MM-DD HH:MM"
```
Refaktorera alla synliga timestamp-fält i:
- `report-candidate-blocks-health` (alla nya diagnostics + examples)
- `DecisionTraceDrawer` (alla nya panels)
- markera tydligt `local_time` i fältnamn

Inga ändringar i datalagring eller jämförelselogik.

### Steg 1 — Geo-anchor-läsare (server)

Ny fil: `supabase/functions/_shared/time-engine/loadGeoAnchors.ts`

Läser **read-only** för (staffId, dateUtcWindow, organizationId):
- `assistant_events` där `event_type IN ('arrival','departure')` AND `source` startar med `geofence`
- `staff_presence_events` där `event_type IN ('arrival','departure','signal_lost','signal_resumed')`

Mappar till enhetlig struktur:
```text
GeoAnchor {
  id, staffId, organizationId,
  type: 'entry' | 'exit',
  source: 'assistant_events' | 'staff_presence_events',
  rawSourceLabel: 'geofence_foreground' | ...,
  targetType: 'project' | 'large_project' | 'location' | 'booking',
  targetId,
  targetLabel,
  timestamp_utc,
  timestamp_local_stockholm,   // for display only
  confidence: 'high'
}
```

### Steg 2 — Korsmatcha mot WorkTargets

Endast anchors där `targetId` matchar en `WorkTarget` som är:
- `validity = 'valid'`
- `canAutoMatchAsWork = true`
- och samma org

…blir **hard anchors**. Övriga (sekundära/ogiltiga datum/ej tilldelade) loggas som `weak_anchor`, används aldrig för stickyness.

### Steg 3 — Skicka in i motorn

Ändra signaturer (additivt, defaultar till `[]`):

`buildGpsDayTimeline({ pings, targets, policy, geoAnchors? })`
`buildPresenceDayBlocks({ ..., geoAnchors? })`

`get-staff-presence-day/index.ts`: kalla `loadGeoAnchors(...)` och vidarebefordra.

### Steg 4 — Sticky från geo entry

I `buildGpsDayTimeline` post-pass:

För varje `entry`-anchor till primary target T vid tid `tE`:
- Sätt `stickyTarget = T` från `tE` framåt.
- Alla efterföljande segment till nästa **strong exit** klassas:
  - inom geofence eller `≤ 1.5×radie`: `stay/known_site` med `confidenceReason = 'geo_entry_primary_target'`
  - utanför geofence men `≤ 1 km utanför edge`: `stay/known_site` med `confidenceReason = 'near_sticky_primary_target_no_strong_exit'` och `reclassificationReason = 'geo_entry_sticky_target_no_strong_exit'`
  - `> 1 km utanför edge` ELLER `entry`-anchor till annan primary target: **strong exit** → sticky släpps, transport tillåts.

`exit`-anchor ensam släpper **aldrig** sticky. Om exit kommer utan strong exit:
- markera segment med `evidence.warningLabel = 'Geo exit mottagen, men ingen stark exit bevisad'`
- `geoExitIgnoredBecauseNoStrongExit++`

### Steg 5 — Presence-/Report-lager

`buildPresenceDayBlocks`:
- Block som täcks av en hard entry-anchor får `kind = 'confirmed_on_site'`, `confidenceReason = 'geo_entry_primary_target'`.
- Geo exit utan strong exit blir **inte** transport.

`buildReportCandidateBlocks`:
- `confirmed_on_site` → `kind = 'work'`.
- Warning från Steg 4 propageras till row-`warningLabel` med samma prio som tidigare sticky-warning.
- Ingen transport-rad förrän strong exit.

### Steg 6 — Decision Trace UI (`DecisionTraceDrawer.tsx`)

Ny panel "Geo entry / sticky":
- "Geo entry låste användaren till **{targetLabel}** kl. **{HH:MM} Europe/Stockholm**"
- "Projektet behöll användaren — geo exit hade ingen stark exit-bevisning"
- "Transport startade först när strong exit upptäcktes"

Visa fält (alla i lokaltid):
`anchorSource`, `anchorTimestampLocal`, `distanceFromStickyCenterMeters`, `distanceOutsideStickyGeofenceMeters`, `arrivedAtOtherPrimaryTarget`, `longClearExit`, `reasonNotReclassified`.

### Steg 7 — Health check (`report-candidate-blocks-health/index.ts`)

Lägg till aggregat:
```text
geoAnchorDiagnostics: {
  geoEntryCount,
  geoExitCount,
  geoEntryAnchoredMinutes,
  geoExitIgnoredBecauseNoStrongExitCount,
  geoExitIgnoredBecauseNoStrongExitMinutes,
  transportAfterGeoEntryWithoutStrongExitCount,
  transportAfterGeoEntryWithoutStrongExitMinutes,
  examples: [{ staff, targetLabel, entryAtLocal, ... }]   // Stockholm-tid
}
```

Nya WARNINGS:
- `transport_after_geo_entry_without_strong_exit` om `transportAfterGeoEntryWithoutStrongExitMinutes > 0`
- `geo_exit_without_strong_exit_ignored` (info-nivå, inte varning) om `> 0`

Också: byt alla existerande timestamp-fält i responsen till lokaltid.

### Steg 8 — Read-only verifiering 2026-05-09

Kör `report-candidate-blocks-health` POST för Frans August AB (`f5e5cade-…`), datum **2026-05-09**, alla personer. Rapportera i text:

1. Hittades geo entry-events? **Ja/nej, var.**
2. Tabell? **assistant_events vs staff_presence_events.**
3. Kopplades till primary target? Antal hard vs weak.
4. Lock-effekt: per (staff, target) — `entryAtLocal → strongExitAtLocal` eller "fortfarande sticky".
5. `geoExitIgnoredBecauseNoStrongExitMinutes` per person.
6. `transportAfterGeoEntryWithoutStrongExitMinutes` per person — ska vara 0.
7. **Armands/GOPA-fokus**: konstatera att inget GOPA-entry-event finns i `assistant_events`/`staff_presence_events` (departure från FA 04:05 finns). Visa vad sticky/stationary-fallback gör för 02:38–03:03 och 04:08–06:54 — eller flagga om motorn fortfarande missar.
8. Inga writes — verifiera kodvägar + att SQL bara använder `select`.
9. Ingen AI — bekräfta att `analyze-unclear-segment` aldrig anropas.
10. Mobilappen — orörd (inga ändringar i `src/pages/mobile/**`, `useGeofencing`, `useWorkSession`, assistant).

Redovisa allt i **Europe/Stockholm**.

### Filer som ändras

- `supabase/functions/_shared/timeline/geo.ts` (ny `formatStockholm`)
- `supabase/functions/_shared/time-engine/loadGeoAnchors.ts` (ny)
- `supabase/functions/_shared/time-engine/contracts.ts` (typ `GeoAnchor`)
- `supabase/functions/_shared/time-engine/buildGpsDayTimeline.ts` (geoAnchors-arg + sticky-from-entry)
- `supabase/functions/_shared/time-engine/buildPresenceDayBlocks.ts` (confirmed_on_site)
- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` (warning-propagering)
- `supabase/functions/get-staff-presence-day/index.ts` (load + pass through)
- `supabase/functions/report-candidate-blocks-health/index.ts` (geoAnchorDiagnostics + Stockholm-tid)
- `src/components/staff/DecisionTraceDrawer.tsx` (panel + Stockholm-tid)

### Säkerhet

- Inga `time_reports` / `workdays` / `location_time_entries` / `travel_time_logs` skapas.
- Inga ändringar i råa `assistant_events`, `staff_presence_events`, `staff_location_history`, `bookings`, `projects`.
- Ingen AI körs (`analyze-unclear-segment` inte anropad).
- Ingen mobilapp-kod ändras.
- Attestflödet rörs inte.

Godkänn så kör jag.
