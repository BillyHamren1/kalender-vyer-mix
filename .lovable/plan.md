## Mål

Gantt-raden för en person på `/staff-management/time-reports` ska visa **exakt samma block, i samma ordning, med samma etikett** som detaljvyn (ReportCandidateTimeline). Inga sammanslagningar, inga absorberingar till chips, ingen omklassning till RIGG/RIGGDOWN.

## Vad som händer idag (varför bilderna skiljer)

I `src/components/staff/StaffGanttView.tsx` kör `blocksFromStaff` tre extra steg ovanpå `reportCandidateBlocks` (som detaljvyn använder rakt av):

1. **`mapReportCandidateKind`** mappar om `work` → `rig` / `rigdown` / `warehouse` / `review` baserat på bokningens fas → Westmans-blocken blir RIGG.
2. **`applyVisualMerge`** slår ihop intilliggande block av samma kind med ≤15 min glapp → flera Westmans-rader blir ett block.
3. **`buildVisualGanttBlocks`** absorberar korta transport-/granska-/okänd-block som chips på närmaste huvudblock → två av tre `Resa`-rader försvinner.

Detaljvyn (ReportCandidateTimeline, bild 2) renderar däremot `reportCandidateBlocks` rakt av.

## Lösning

Lägg en ny "raw mirror"-pipeline i `blocksFromStaff` som körs i stället för stegen ovan när källan är reportCandidate:

### Klassmappning (matchar ikonerna i detaljvyn)

| reportCandidate block | Gantt-kind | Färg/etikett |
|---|---|---|
| `kind === 'transport'` | `transport` | TRANSPORT (blå) |
| `kind === 'work'` + `reviewState === 'needs_review'` ELLER `låg konfidens`-flagga | `review` | GRANSK (gul) |
| `kind === 'work'` + `isWarehouseTarget(b)` | `warehouse` | LAGER (lila) |
| `kind === 'work'` (allt övrigt) | `work` | Titel = `resolveActualLocationTargetForBlock(...).finalTitle` (t.ex. "Westmans Uthyrning - 23 maj 2026") |
| `kind === 'needs_review'` / `unknown` / `break` | oförändrat | — |

Alltså: **ta bort rig/rigdown-grenen helt** i denna vy. Phase-styrd RIGG-färg används inte längre här.

### Pipeline-ändringar i `blocksFromStaff`

- Behåll `processBlock` (samma titel-resolver, samma night-guard, samma private-home-suppression) så att etiketterna blir identiska med detaljvyn.
- Ersätt `mapReportCandidateKind`-anropet med den nya tabellen ovan.
- **Skippa `applyVisualMerge`** — returnera blocken sorterade på `startAt`.
- **Skippa `buildVisualGanttBlocks`** — inga chips, inga absorberade transporter, inga lane-packed huvudblock. Varje reportCandidate-block blir ett eget Gantt-block.
- Behåll `sessionPhaseMap`-uträkningen om den används av andra konsumenter, men använd den inte för kind-bestämning här.

### Header "0h arbete"

Sekundärt men relaterat: när det inte finns sparade `time_reports` visar raden "0h arbete". Använd `reportCandidateSummary.payable_minutes` (alt. summan av `work`-blockens `durationMinutes`) som visning när time_reports är tomt, så headerns siffra matchar de 8h 46m som detaljvyn rapporterar. Lägg in detta i samma PR.

## Tester

Skapa `src/test/staffGantt.mirrorsReportCandidate.test.ts` med fixturen från Markus dag (bild 2):

1. **Antal block**: Gantt returnerar exakt 8 block för fixturen.
2. **Ordning + tider**: matchar `[08:14, 09:36, 10:40, 11:25, 12:05, 13:08, 15:01, 15:07]`.
3. **Klassning**:
   - 3 × `transport`
   - 2 × `review` (`låg konfidens`-blocken)
   - 1 × `warehouse` (FA Warehouse)
   - 2 × `work` (Westmans 09:36–10:40 och 15:01–15:06)
   - **0 × `rig` / `rigdown`** — kontrakt-test som låser detta.
4. **Ingen merge**: två angränsande Westmans-block får aldrig slås ihop i denna vy.
5. **Inga chips**: `attachedChips`/`absorbedSourceIds` är alltid `undefined`/tom.
6. **Headertotaler**: hjälparen returnerar `payable_minutes ≈ 526` (8h 46m) för fixturen när time_reports är tomt.

Kör därefter:
- `bunx vitest run src/test/staffGantt.mirrorsReportCandidate.test.ts`
- Hela time-reporting quality gate: `bash scripts/test-time-reporting.sh`

## Filer som ändras

- `src/components/staff/StaffGanttView.tsx` — ny `mapReportCandidateKindMirror` + skip merge/absorb-grenen.
- `src/components/staff/StaffTimeReportsList.tsx` (eller motsvarande header-räknare) — fallback till `reportCandidateSummary` när time_reports saknas.
- `src/test/staffGantt.mirrorsReportCandidate.test.ts` — ny.

## Risker / utanför scope

- Påverkar bara Gantt-vyn i `/staff-management/time-reports`. Detaljvyn, decisionTraceDrawer, RawEvidenceDrawer och projektkalendern rörs inte.
- Phase-baserad RIGG-färg försvinner i denna vy. Vill man ha tillbaka phase som badge senare kan det läggas som en liten chip på blocket utan att ändra själva blockstrukturen.
