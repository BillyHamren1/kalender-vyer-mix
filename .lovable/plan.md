## Problem

På `/staff-management/time` (bild 2) visas helt andra siffror än i GPS-veckovyn (bild 1):

| Dag | GPS-veckovy (bild 1) | Tidrapportsida (bild 2) |
|-----|----------------------|--------------------------|
| Mån 25/5 | Arbete 10h 27m | 3m |
| Tis 26/5 | Arbete 9h 27m + Resa 1h 44m | 9h 29m |
| Tors 28/5 | Arbete 2h 30m + Resa 1h 8m | — (ingen rapport) |

Orsaken är att de två vyerna går igenom helt olika pipelines:

- **Bild 1** (GPS-veckovy) läses från edge-funktionen `get-staff-gps-week-summary`, som bygger varje dag med `buildCanonicalStaffDayGpsResult` (delar samma kod som GPS-satellitkartan). Detta är den enda vyn där "Arbete", "Resa", "FA Warehouse → Swedish game fair" m.m. faktiskt är rätt — det är ren GPS, ingen Time Engine-omskrivning.
- **Bild 2** (tidrapportsida → "Förslag från Time Engine") läses från `staff_day_report_cache.summary_json` som skrivs av `backfill-staff-day-report-cache` via den interna Time Engine-byggaren (`report.blocks`). Den räknar om allt själv (geofence-policy, workday-policy, klippregler) och får ofta dramatiskt lägre siffror.

Användarens krav: **spegla GPS-veckovyn 1:1**. Ingen omräkning, ingen geofence, ingen workday. Det som syns på bild 1 ska vara det som personalattest visar och det som sparas på projekt och tidrapport.

## Lösning

Gör `buildCanonicalStaffDayGpsResult` till den enda källan för tidrapport-förslag. Den engine-cache som tidrapportsidan läser ska skrivas direkt från canonical-resultatet, och submit-vägen som sparar tid på projekt/tidrapport ska använda samma block.

### 1. Bygg cache från GPS-canonical (bakåt)
- I `supabase/functions/backfill-staff-day-report-cache/index.ts`: ersätt det interna `report`/Time Engine-flödet med ett anrop till `buildCanonicalStaffDayGpsResult`. Skriv om `summary_json` så fälten matchar canonical-resultatet:
  - `workMinutes` = `canonical.totals.workMinutes` (Arbete = 10h 27m, 9h 27m, …)
  - `travelMinutes` = `canonical.totals.travelMinutes` (Resa = 1h 44m, 1h 8m, …)
  - `payableMinutes` = `workMinutes + travelMinutes` (det som tidrapporten räknar som "godkännbar tid", t.ex. 9h 32m → 11h 11m för 26/5)
- `report_candidate_blocks_json` skrivs från canonical-segmenten (place stays + travel-segments) med `fromLabel`/`toLabel`, `targetType`, `targetId`, `start/end`, `durationMinutes`. Då visar drawern på tidrapportsidan exakt samma rader som bild 1 ("FA Warehouse 08:58–09:49", "Resa FA Warehouse → Swedish game fair", …).
- `display_blocks_json` rörs inte (skrivs av display-pipelinen separat — låt den fortsätta läsa från samma canonical-källa, se steg 2).

### 2. Online-vägen (idag och framåt)
- I `sync-staff-day-report-cache` (cron) går allt redan via backfill-funktionen, så den behöver inte ändras — den ärver nya logiken.
- I `submit-mobile-gps-day-v2` och `submit-staff-day-v3`: bygg `staff_day_submissions.start_time/end_time/source_summary_json` från samma `buildCanonicalStaffDayGpsResult`. När personalen attesterar är det GPS-vyns siffror som hamnar i `time_reports` och `location_time_entries`, oavsett vilken admin-vy man tittar på.

### 3. Tidrapport-läsaren
- `src/components/staff-time-approvals/weeklyApprovalModel.ts` läser redan `summary_json.payableMinutes`/`workMinutes`. Inget behöver ändras där — den kommer automatiskt visa 10h 27m / 9h 27m+1h 44m så fort cachen byggs om.
- "Förslag från Time Engine"-pillen byter etikett till **"Förslag från GPS"** (bild 2 visar inte längre Time Engine).
- Drawern (`StaffDayInspectionDrawer`/`DayInspectionSections`) läser `report_candidate_blocks_json` → blocken kommer redan ha `fromLabel`/`toLabel`, så "Resa FA Warehouse → Swedish game fair" syns även där.

### 4. Backfill av historik
- Kör `backfill-staff-day-report-cache` för innevarande och föregående vecka för Raivis (och hela orgen) så att tidrapportsidan visar nya siffrorna direkt utan att vänta på cron.

## Det här ändras INTE
- `time_reports`-tabellen och hur lön/projekt-kostnad sammanställs. Vi flyttar bara *källan* för förslagssiffrorna och submit-payloaden — själva sparningen lever kvar oförändrad.
- GPS-pings, geofence-data, workday-flaggor. Inga rader raderas eller migreras.
- Bild 1 (`get-staff-gps-week-summary`) — den är redan rätt och blir nu enda sanningen.

## Teknisk sammanfattning
- Edge: `backfill-staff-day-report-cache` skrivs om så `summary_json`/`report_candidate_blocks_json` byggs direkt från `buildCanonicalStaffDayGpsResult` (samma kontrakt som `get-staff-gps-week-summary`).
- Edge: `submit-mobile-gps-day-v2` + `submit-staff-day-v3` använder samma canonical-builder för submitted payload.
- Frontend: minimalt — bara etikettändring + nytt deploy. UI-modellen läser redan rätt fält.
- Konstant att låsa i memory: **"Time report page mirrors GPS week summary 1:1"** — tidrapport-cache får ALDRIG byggas från någon annan motor än `buildCanonicalStaffDayGpsResult`.

## Verifiering
- Kör `backfill-staff-day-report-cache` för Raivis vecka 22 och jämför `summary_json.payableMinutes` mot `get-staff-gps-week-summary` per dag — ska vara exakt lika.
- Vitest: nytt test i `src/test/` som anropar båda källorna för en mock-dag och försäkrar att `workMinutes`, `travelMinutes`, segment-listan och labels stämmer rad för rad.
- Manuellt: öppna `/staff-management/time` för Raivis vecka 22 → Mån ska visa 10h 27m, Tis 11h 11m (9h 27m + 1h 44m), Tors 3h 38m.
