## Mål

Stoppa Time Engine från att rendera tomma signalgap (gammal öppen dag, pre-first-GPS gap, kort on-site-blipp följd av timmar av signalsaknad) som synliga `needs_review`-block i Gantt. Det är dessa som ger Pavels falska "Osäker period 00:01–08:15".

Påverkar enbart **visuell rendering + reviewklassning** — totals, ekonomi, time_reports och TR-skrivvägar rörs inte.

## Bakgrund (varför det blir fel idag)

I `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts`:

1. Rad ~1486–1503: när en `signal_gap` / `uncertain_transition` inte kan bindas till föregående/efterföljande target och `isDayOpen(...)` är true → blocket finaliseras som `needs_review` med `reviewReasons=['signal_gap_open_day']`. Inget villkor på faktisk närvaro / confirmed minutes / source-blocks → tomma gap blir synligt review.
2. Det finns redan `clampBlocksToDayEndDecision.ts` som markerar pre-dayEnd-block som review när dagsslut "drogs in", men det filtrerar inte bort gap utan presence.
3. Inga befintliga fält `hiddenReason` / `hiddenFromGantt` finns på `ReportCandidateBlock`. Vi lägger till sådana.
4. `WhyReview` (ReportCandidateTimeline.tsx rad 235–260) använder `evidenceSummary.presenceBlockCount`. När summeringen är 0 men `sourcePresenceBlockIds.length > 0` blir hint-texten "Inga underliggande närvaro-block" inkonsekvent med "Källblock (N)" som visas i drawerns lista.
5. Ingen verklig "duplicate `let j = i + 1`" finns kvar i filen — de två matchningarna ligger i olika scopes (kontrolleras före edit, ingen ändring om inget hittas).

## Ändringar

### 1. `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts`

Lägg till två fält på `ReportCandidateBlock` (och spegla i `enrichReportBlocksForCache` om typen exporteras därifrån):

```ts
hiddenReason?:
  | 'open_day_signal_gap_without_presence'
  | 'pre_first_gps_signal_gap'
  | 'short_onsite_anchor_noise';
warningReason?: string; // ex. 'signal_gap_open_day_suppressed'
```

Introducera POST-PASS efter alla nuvarande passes (precis innan retur av `out`) — en ny funktion `suppressEmptySignalGapReviewBlocks(out, input, policy)` som markerar `hiddenReason` (renderar i diagnostics men inte i Gantt) enligt regler:

**Regel A — open_day_signal_gap_without_presence:**
För varje block med `reviewState === 'needs_review'` OCH (reviewReasons innehåller `signal_gap_open_day` ELLER `clamped_to_day_end_decision`):
- markera `hiddenReason = 'open_day_signal_gap_without_presence'` om ALLA stämmer:
  - `evidenceSummary.confirmedMinutes === 0`
  - `evidenceSummary.probableMinutes === 0`
  - `targetId == null && targetLabel == null`
  - `sourcePresenceBlockIds.length === 0` ELLER alla source-blocks är av kind `signal_gap`/`uncertain_transition`
  - raw GPS pings inom `[startAt, endAt]` är ≤ `policy.openDayGapMinPingsToKeepVisible` (default 5) ELLER alla pings ligger inom de sista 120 sek av blocket
- sätt `warningReason = 'signal_gap_open_day_suppressed'`

**Regel B — pre_first_gps_signal_gap:**
Beräkna `firstUsableGpsTs` = första ping i `input.gpsPings` (alla källor som redan används i pipen) på `input.date`. För block som slutar ≤ `firstUsableGpsTs` + 60s, har kind/dominerande kind `signal_gap`/`uncertain_transition`, saknar confirmed och presence-source → markera `hiddenReason='pre_first_gps_signal_gap'`.

Diagnostics (returneras i `buildReportCandidateBlocks`-resultatets diagnostics-fält):
- `preFirstGpsSignalGapSuppressedMinutes`
- `openDaySignalGapSuppressedCount`
- `openDaySignalGapSuppressedMinutes`

**Regel C — short_onsite_anchor_noise:**
För varje `confirmed_on_site`/`probable_on_site`-block med:
- `durationMinutes < 5`
- följt direkt av ett `signal_gap`/`uncertain_transition` ≥ 60 min
- och blocket är inte ankrat av en aktiv timer / TR (`input.activeTimeRegistrations`/`input.timeReports` har ingen overlap som täcker mer än just denna minut)
→ markera `hiddenReason='short_onsite_anchor_noise'`. Räkna `shortOnSiteAnchorSuppressedCount` + `shortOnSiteAnchorSuppressedMinutes` i diagnostics.

OBS: regelmotorn ändrar **inte** evidenceSummary-totaler. Suppressade block räknas separat i diagnostics och påverkar inte work/review-totals.

**Regel D — Inga ändringar av transport/GPS från första riktiga ping.**
Implicit följer av regel B: när pre-first-GPS-blocket suppressas använder pipelinen redan första riktiga GPS-segment för transport/work — ingen extra ändring krävs.

**Regel E — Review-tightening:**
Redan finaliserade `signal_gap_open_day`-block utan presence rensar vi via `hiddenReason`; vi tar inte bort `reviewState` så snapshot/cache är oförändrade — vi flaggar bara.

**Del 9 — dubblettkoll:** läs raderna 1525 + 3264 i filen och verifiera att de är i två separata scopes. Om en verklig dubblett dyker upp i samma block, ta bort. (Förväntat: ingen ändring.)

### 2. `supabase/functions/_shared/time-engine/clampBlocksToDayEndDecision.ts`

Inga funktionsändringar. (Reglerna ovan suppressar redan dess output när presence saknas.)

### 3. `supabase/functions/_shared/time-engine/consolidateReportBlocksIntoSessions.ts`

Lägg till filter i ingången: block med `hiddenReason` skickas inte in i session-konsolideringen — de gör inget i sessions. Om en hel session bara består av suppressade block: skippa sessionen helt.

### 4. `src/lib/staff/buildStaffGanttMirrorBlocks.ts` & `src/lib/staff/ganttVisualPipeline.ts`

I `buildReportCandidateBlocks` (mirror-vägen, rad ~253–320) filtrera bort block med `hiddenReason` innan de mappas till `PipelineBlock`. Bevara dem däremot i ett separat returfält `hiddenBlocks` så detail/debug-vyer kan visa dem.

I `ganttVisualPipeline.ts`: inga ändringar (block med `hiddenReason` når aldrig pipelinen).

### 5. `src/components/staff/StaffGanttView.tsx`

I rendering: dolda block ska inte ritas som Gantt-rader. När alla block för en dag är dolda, visa istället en liten diagnos-rad: "Inga riktiga arbetsblock — endast suppressade signalgap (N min)". Detta kräver att Gantt-vyn tar emot `hiddenBlocks` från mirror.

### 6. `src/components/staff/ReportCandidateTimeline.tsx` (Del 6 + 7)

- **WhyReview (rad 235–260):** byt logiken så `'Inga underliggande närvaro-block'`-hinten **endast** triggas när `(block.sourcePresenceBlockIds?.length ?? 0) === 0`. Inte `evidenceSummary.presenceBlockCount`.
- När `evidenceSummary.presenceBlockCount !== sourcePresenceBlockIds.length`: visa debugrad i drawer-evidensrutan: `Evidence-count mismatch: summary X, sourceIds Y` (liten muted text under "Närvaro-block: N").
- **Raw GPS-tabben** (lokalisera sektionen som visar "X pings i blocket · Y totalt på dagen"): lägg under siffrorna en muted hjälptext: `"Blocket innehåller bara GPS inom valt tidsintervall. Total dag-GPS används som jämförelse."`
- För block med `hiddenReason`: visa liten badge "Suppressad — `<reason>`" i blockhuvudet och skäl-text längst upp i drawern.

### 7. Test — `supabase/functions/_shared/time-engine/__tests__/suppressEmptySignalGap.test.ts`

Nytt Deno-test som matar in ett scenario som Pavels 2026-05-19:
- 00:01–00:59 signal_gap (gammal open day)
- 00:59–01:00 confirmed_on_site LOGOSOL (1 min)
- 01:00–08:13 signal_gap (7h13m)
- 08:13–08:15 GPS pings börjar (raw)
- inga TR/LTE för dagen, men aktiv `active_time_registration` öppnad föregående dag → `isDayOpen` true

Asserts:
- Inget block i `out.filter(b => !b.hiddenReason)` täcker tidsintervallet `00:01–08:13`.
- Det 7h13m gap-blocket har `hiddenReason='open_day_signal_gap_without_presence'`.
- Det 1-min LOGOSOL-blocket har `hiddenReason='short_onsite_anchor_noise'`.
- `diagnostics.preFirstGpsSignalGapSuppressedMinutes ≥ 433` (7h13m).
- `diagnostics.shortOnSiteAnchorSuppressedCount === 1`.
- Block från 08:13 och framåt är opåverkade.

Plus parity-test i `src/lib/staff/__tests__/buildStaffGanttMirrorBlocks.suppressed.test.ts` (vitest):
- Mockad ReportCandidateBlockUI med `hiddenReason` → utesluts från Gantt-pipeline-output, finns i `hiddenBlocks`.

Plus WhyReview-test i `src/components/staff/__tests__/ReportCandidateTimeline.whyReview.test.tsx`:
- block med `sourcePresenceBlockIds = ['a','b','c','d']` och `evidenceSummary.presenceBlockCount = 0` → renderar INTE "Inga underliggande närvaro-block", renderar däremot debug-mismatchraden.

### 8. Körning

Efter koden:
1. `bash scripts/test-time-reporting.sh` (eller motsvarande) — säkerställ att inga befintliga tester går sönder.
2. `lovable-exec test` för vitest-svit.
3. Deploy `mobile-app-api`/relevanta edge funcs som importerar time-engine (om de buntar in den).
4. Inspektera Pavels 2026-05-19 i admin-Gantt och bekräfta att "Osäker period 00:01–08:15" är borta och att 08:13+ visas korrekt.

## Vad rapporten ska säga (efter genomförd implementering)

- A. `signal_gap_open_day` blev tidigare synligt review-block i `buildReportCandidateBlocks.ts` runt rad 1486–1503 utan att kontrollera om blocket hade någon faktisk närvaro/confirmed/source-presence.
- B. Pre-first-GPS gap suppressas i nytt POST-PASS via Regel B: jämför blockets `endAt` mot dagens första riktiga GPS-ping.
- C. Korta on-site-blippar (<5 min) följt av >60 min signal_gap utan timer/TR-stöd suppressas via Regel C.
- D. Pavels får inte längre "Osäker period 00:01–08:15" — verifierat i nytt deno-test + manuell admin-Gantt-kontroll.
- E. Raw GPS 08:13+ är opåverkad — pipelinen kör vidare som vanligt, suppression sker bara på dolda block.
- F. WhyReview använder `sourcePresenceBlockIds.length`, inte `presenceBlockCount`. Debugrad visas vid mismatch.

## Inget annat rörs

- `time_reports`, `location_time_entries`, `workdays` — ingen DB-skrivning.
- Time Data Authority oförändrad — GPS är fortsatt förslag, inget skrivs automatiskt.
- Night auto-start guard / Single Timer Policy / arrival popup — ej berörda.
- Suppressade block räknas inte med i lön/projekttotal (de var aldrig confirmed).
