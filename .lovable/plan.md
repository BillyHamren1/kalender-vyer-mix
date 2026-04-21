

## Fixa dubbelräkning i Jānis dagöversikt

### Vad data visar för Jānis (21 april)

| Källa | Tid | Status |
|---|---|---|
| `location_time_entries` (Lager) | start 06:58, **exited_at = NULL** | räknar fortfarande live |
| `travel_time_logs` (Resa → kund) | 07:15 → 08:24 (1h 8m, klassad `work`) | avslutad |
| `time_reports` | inga | — |

Lagerklockan startade kl. 06:58 när han kom till lagret. Klockan 07:15 lämnade han lagret och GPS:en loggade en resa till kunden (1h 8m). **Men ingen stängde lager-sessionen** → den fortsätter ticka och ger nu ~1h 50m, samtidigt som resan adderar ytterligare 1h 8m → "2h 53m" istället för korrekta ~1h 50m.

### Rotorsak

I `useGeofencing` när användaren lämnar en fast plats (warehouse) sätts inte `exited_at` på `location_time_entries`-raden. Och när en resa registreras (`travel_time_logs` skapas) finns ingen koppling som stänger en pågående lager-session. Resultatet: överlappande tid räknas dubbelt.

### Fix

**1. Auto-stäng lager-pass när resa startar (huvudfixen)**
I `src/hooks/useGeofencing.ts` (eller där `travel_time_logs` skapas av `useTravelDetection`):
- När en travel-log börjar för en `staff_id`, hitta öppna `location_time_entries` (`exited_at IS NULL`) för samma staff och sätt `exited_at = travel.start_time`, `total_minutes = (start_time - entered_at)`.
- När geofence "exit" triggar för en location ska `exited_at` sättas direkt — inte vänta på att appen stängs.

**2. Dedupliceringsfilter i Dagöversikt (defensiv lösning)**
I `StaffTimeReportDetail.tsx` där `dailyOverviewWork` byggs:
- För varje pågående lager-pass: capa "live duration" till **min(now, första travel_log.start_time efter entered_at)**. Då slutar lager-tiden visas som växande så fort en resa registrerats efter starten.
- Lägg en varnings-badge `⚠️ Lagerpass ej stängt — kapad till resans start` så admin ser anomalin.

**3. Backfill för Jānis just nu**
Engångs-UPDATE på rad `b347ff5d-c504-419f-b656-d585b1a3726b`:
```sql
UPDATE location_time_entries
SET exited_at = '2026-04-21 05:15:55.177+00',
    total_minutes = 17
WHERE id = 'b347ff5d-c504-419f-b656-d585b1a3726b';
```
(samma logik kan köras som migration: stäng alla öppna location_time_entries där det finns en senare travel_time_log för samma staff.)

**4. Admin-kontroll (anomali)**
Lägg till anomalitypen `overlapping_location_and_travel` i `time_report_anomalies` så att överlapp mellan en öppen presence-session och en travel-log flaggas, oberoende av om geofence-stängningen missas i framtiden.

### Filer som ändras
- `src/hooks/useGeofencing.ts` — stäng `location_time_entries` vid geofence-exit OCH när travel detecteras.
- `src/hooks/useTravelDetection.ts` — vid skapande av travel_log, anropa "close-open-location-entries"-helper.
- `src/services/locationTimeService.ts` — ny funktion `closeOpenEntriesForStaff(staffId, beforeTime)`.
- `src/components/staff/StaffTimeReportDetail.tsx` — capa pågående pass till nästa travel-log:s start; visa varnings-badge.
- Engångs-SQL för Jānis (via migration eller direkt insert/update).
- Valfritt: anomali-detektor för överlapp.

### Förväntat resultat för Jānis
- Lager: 06:58 → 07:15 = **17 min** (stängs när resa startar)
- Resa: 07:15 → 08:24 = **1h 8m**
- Totalt: **~1h 25m** (matchar de andra som inte hade lager-stopp)
- Ingen växande "live"-tid på en plats han inte längre är på.

