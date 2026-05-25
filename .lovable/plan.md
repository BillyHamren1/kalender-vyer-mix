# Time v2 — Boende vs Lager + ärlig "vi vet inte"-rad istället för fantomresor

## Användarens klagomål (16/5)

Mån 18/5 visar `Resa Craft → —  12:52–22:29  9h 36m`. Personen var INTE hemma. Tighta boendet får under inga omständigheter:

- stänga dagen,
- ätas upp av en falsk "Resa till ingenting",
- blandas ihop med lagret (warehouse).

Och **om** systemet faktiskt tror han är hemma — då ska det stå "Hemma", aldrig "Resa".

## Rotorsak (i koden)

`supabase/functions/_shared/time-v2/loaders.ts` läser `organization_locations` utan att skilja på `is_private_residence`. Allt blir `type: "location"`. Konsekvenser:

- Boende och Lager renderas identiskt → admin kan inte skilja på dem.
- `findContainingTarget` i `buildGpsDayTimelineOnly.ts` exkluderar `type === "home"` — men boendet är inte ens taggat som "home" här, så fältet stänger inget.
- Pings utan match (tighta polygoner) bildar EN movement-chain ända till sista pingen → 9h "Resa Craft → —".
- Det finns ingen regel som säger: "lager och boende ligger granne — om vi pendlar mellan dem ska det inte räknas som dagens slut".

## Fix — fyra delar, isolerade till Time v2 + timeline-byggaren

### 1. Boende får en egen typ ("home") och tight prioritet (loaders.ts)

Hämta `is_private_residence` + `radius_meters` från `organization_locations`. Mappa:

- `is_private_residence === true` → `KnownPlace.type = "home"`, namn prefixat med "Boende " om det inte redan finns.
- Annars → `type: "location"`, namn används som det är (lager etc.).

`KnownPlace` har redan `"home"` i `MatchedSiteType` — inget typkontrakt behöver röras.

Tight-fence respekteras: `radiusM = Math.max(15, Number(r.radius_meters ?? 75))` (sänkt minimum från 20 → 15 så jättetight boende inte blåses upp).

### 2. Home får MATCHA, inte exkluderas (buildGpsDayTimelineOnly.ts)

Ta bort `if (place.type === "home") continue;` i `findContainingTarget`. Pings inne i boendet blir då stays märkta `matchedSiteType: "home"` med namnet "Boende …".

Konsekvens i `buildDayView.ts`: `workMinutes`-räknaren exkluderar redan `matched.kind === "home"`, så hemmatid räknas inte som arbete — men visas tydligt som egen rad "Boende …".

### 3. Boende avslutar ALDRIG dagen och lägger sig ALDRIG ovanpå lager-match

Ny regel i `matchSegmentsToPlaces` + `findContainingTarget`: när en ping/segment ligger inom flera kända polygoner samtidigt (boende + lager överlappar), välj alltid icke-home först. Endast om ingen icke-home matchar används home.

Plus: en "home" stay som varar < 60 min och har en icke-home stay (lager/projekt) inom 30 min före ELLER efter ska behandlas som "kort pendling hem" — kvarstår som egen rad "Boende (kort besök)", men hindrar inte:

- senare lager-/projektsegment från att räknas,
- dagen från att fortsätta efter besöket.

(Detta är bara klassificering — vi rör inte några dag-stäng-flöden.)

### 4. Inga 9h fantomresor — splittra eller okändförklara

I `buildGpsDayTimelineOnly.ts`:

- **Inuti `buildTravelChains`**: om `gapMs > 10 min` mellan två movement-pings, emit:a ett `gps_gap`-segment mellan dem istället för att rakt av flush:a en travel.
- **Efter att en travel-chain byggts utan matched destination**:
  - om `durationMin >= 30` och `avgKmh < 3` → reklassa till `kind: "stay", type: "unknown_place", label: "Okänd stillastående plats"`.
  - om `durationMin > 90` → kapas: första 30 min får vara `travel`, resten blir `gps_gap` (om medelpingintervall ≥ 5 min) annars `unknown_place` stay.

Resultatet: en 9h-resa till ingenting kan inte längre existera. Antingen ser admin en "Boende"-rad, en "Lager"-rad, en "Okänd plats"-rad, eller en "GPS-glapp"-rad — aldrig "Resa till —".

## UI-tydlighet (admin attest-panel + mobil Time v2)

I komponenter som redan renderar `DayViewSegment`/`DayViewRow` (lägg till om saknas, ingen ny logik):

- Färg/ikon-mappning per `matched.kind`:
  - `home` → lila prick + ikon "Hem" + label "Boende".
  - `location` → blå prick + ikon "Warehouse" + label "Lager / Plats".
  - `project` → grön prick + ikon "Briefcase".
  - `unknown_place` → grå prick + "Okänd plats".
  - `gps_gap` → streckad ram + "GPS-glapp".
- Travel-rad utan destination renderas aldrig längre (regel 4 dödar källan).
- Mobil och admin: lägg en liten badge i raden som visar polygon-id-suffix när två known sites överlappar ("Boende (tight)" / "Lager").

Filer som rör UI (ingen ny state, bara presentation):

- `src/features/mobile-time-v2/MobileGpsSegmentCard.tsx`
- `src/components/staff-time-approvals/StaffWeeklyApprovalRow.tsx` (om den listar segment) eller motsvarande detaljvy.

## Tester

Lägg cases i `supabase/functions/_shared/time-v2/buildDayView_test.ts`:

1. **Boende + lager bredvid varandra**: en boende-polygon (15m) och en lager-polygon (80m) som tangerar. Pings inne i båda → ska matchas som "location" (lager), inte "home".
2. **Kort hembesök mitt på dagen**: pings projekt 08–12, boende 12–12:30, lager 13–17. Förvänta tre stays + två korta travel; dagen slutar 17 (inte 12:30).
3. **9h efter projekt utan known match**: pings projekt 08–13, sedan sparsamma pings långt från allt 13–22. Förvänta: projekt-stay, kort travel, sedan `gps_gap` eller `unknown_place` — INGEN travel ≥ 30 min utan destination.
4. **Hela eftermiddagen i boendet**: pings projekt 08–13, sedan tydliga pings i boende-polygon 13:30–22. Förvänta: projekt-stay, kort travel, "Boende"-stay 13:30–22. Subtitle visar `Hem 8h 30m` separat från `Arbete`.

Körs via `supabase--test_edge_functions` på Time v2-modulen.

## Filer som ändras

- `supabase/functions/_shared/time-v2/loaders.ts` — läs `is_private_residence`, mappa till `type: "home"`.
- `supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.ts` — fix 2, 3 (prioritetsregel), 4.
- `supabase/functions/_shared/timeline/matcher.ts` — prioritera icke-home vid överlapp.
- `supabase/functions/_shared/time-v2/buildDayView.ts` — säkerställ subtitle visar `Hem` separat, inte i `Arbete`.
- `supabase/functions/_shared/time-v2/buildDayView_test.ts` — nya tester.
- `src/features/mobile-time-v2/MobileGpsSegmentCard.tsx` — färg/ikon per `matched.kind`.
- Admin segmentrenderaren i `staff-time-approvals/` — samma färg/ikonmappning.

## Avgränsningar

- Inga DB-migrationer. `is_private_residence` finns redan på `organization_locations` (`private-residence-home-shortcut-v1`).
- Inga ändringar i `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `staff_day_report_cache`. Mobile Time v2-policyn respekteras.
- Inga auto-stäng-dagen-flöden rörs (No Workday Logic / Single Timer Policy).
- Ingen ny AI/heuristik — bara klassificeringsregler.
