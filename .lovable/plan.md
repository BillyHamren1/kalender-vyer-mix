
## Problemet — vad data visar

För Markuss (2026-05-11) returnerar `get-staff-presence-day` ett block:

```
kind: needs_review
reviewReasons: ["missing_transition_evidence"]
fromLabel: "FA Warehouse"
toLabel:   "Bergman Event AB - 12 maj 2026"
05:28 → 07:01 (1h 33m)
```

Det är en glasklar resa mellan **två kända arbetsplatser** (lager → projekt­adress, ~67 km), men eftersom underliggande presence-block är `uncertain_transition` (GPS-glapp under färd) går den i regel `signal_gap → missing_transition_evidence` i `buildReportCandidateBlocks` och stämplas som "Behöver granskas".

UI-lagret (`buildReportDisplayBlocks`) har redan en "promoteAsBridgedTrip"-rensning, men den ändrar bara titeln — `kind` förblir `needs_review`. Frontendens enrichment vi byggde i förra varvet rör inte heller `kind`.

Du vill att alla sådana här fall ska gå igenom som transport, generellt — inte bara för Markuss.

## Roten — var fixet ska sitta

**`supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts`** — `signal_gap`/`uncertain_transition`-grenen runt rad 815–835 (där `missing_transition_evidence` sätts). Det är denna som speglas av cachen `staff_day_report_cache` och som adminvyn renderar. Fixen där löser det överallt (admin-tidrapporter, mobilens dagsöversikt, AI-pipelinen, health-checken).

## Ny regel — "kända ändpunkter ⇒ transport"

I samma loop, **innan** vi emiterar ett `needs_review`-block med `missing_transition_evidence`:

1. Ta `prev` = senaste föregående block med ett känt arbetsmål (work/transport med targetType ∈ {project, booking, large_project, warehouse, location}).
2. Ta `next` = nästa block med ett känt arbetsmål.
3. Om båda finns och `prevTargetKey !== nextTargetKey`:
   - Emittera ett `transport`-block (samma start/end som gapet, ev. utvidgat till prev.endAt → next.startAt) med:
     - `kind: 'transport'`
     - `reviewState: 'ok'`
     - `confidence: 'high'` när ändpunkterna är säkra (`confirmed_on_site`/aktiv timer på båda sidor); annars `'medium'`.
     - `fromLabel` / `toLabel` ärvs från `prev`/`next`.
     - `subtitle: "<from> → <to> · GPS saknades ~Xm under resan"` när det fanns ett gap.
     - `reviewReasons: []` (varför-granskas-rutan blir inte gul).
   - Hoppa över den gamla `needs_review`-emitten för det här gapet.
4. Annars (bara en sida känd, eller samma target på båda sidor) → behåll dagens beteende (kort gap absorberas, lång lone gap blir `needs_review` enligt nuvarande policy).

Vakter:
- Distansgardet i POST-PASS 2 ("short_cross_target_movement < `realTripMinDistanceMeters`") ska INTE nedgradera tillbaka till `needs_review` när vi har två tydliga kända ändpunkter och varaktigheten är ≥ ~5 min — då vinner "kända ändpunkter".
- Inga ändringar i `presenceDayBlocks` — bara klassningen i candidate-lagret.
- Påverkar inte `time_reports`/lön (transport-blocket är fortfarande ett förslag som admin kan acceptera; ingen auto-create).

## Spegling i UI-lagret

`src/lib/staff/buildReportDisplayBlocks.ts` (rad ~591–646): nuvarande "promoteAsBridgedTrip" som BARA bytte titel men höll `kind: needs_review` blir överflödig — ska ändras så att den följer samma regel som servern (kind: 'transport', reviewState: 'ok'). Så även gamla cachade dagar börjar visas korrekt direkt utan reprocess.

## Backfill av gamla dagar

`staff_day_report_cache` är persisterad. Vi triggar:

- `backfill-staff-day-report-cache` för senaste 60 dagarna efter att edge-funktionen är deployad, så att Markuss + alla liknande historiska dagar uppdateras direkt.

## Tester

Lägg till i `supabase/functions/_shared/time-engine/__tests__/`:
- `bridgedTripPromotion.test.ts`:
  - FA Warehouse → uncertain_transition (90 min, distance 67 km) → Bergman Event ⇒ ETT transport-block, ingen needs_review.
  - Same target på båda sidor (FA → gap → FA, 90 min) ⇒ behåller needs_review (round trip).
  - Bara prev känt, next okänt ⇒ behåller needs_review.
  - Två kända ändpunkter med distance 200 m och 3 min ⇒ kort cross-target absorberas (oförändrat).

Och en regressionsfixture i `src/lib/staff/__tests__/buildReportDisplayBlocks.bridge.test.ts` som matchar Markuss exakta payload (från `staff_day_report_cache` ovan) och förväntar `kind: 'transport'`.

## Out of scope

- Ingen ändring i `create_travel_from_gap`-servern (den hanterar redan rätt, problemet är klassningen i presence-day-pipen).
- Ingen ny tabell, ingen ny edge function.
- Ingen ändring i mobilens enrichment-hook eller `resolve-unknown-stop` — de fortsätter att existera men kommer inte längre triggas för dessa A→B-fall (eftersom blocket inte längre är unknown/needs_review).

## Tekniska detaljer

Filer som ändras:
- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` (huvudregeln + POST-PASS 2-vakt)
- `src/lib/staff/buildReportDisplayBlocks.ts` (parity i display-lagret för cachade dagar)
- Nya testfiler enligt ovan
- Trigga `backfill-staff-day-report-cache` efter deploy

Förväntat resultat på Markuss-raden:
```
kind: transport · ok · high
"FA Warehouse → Bergman Event AB - 12 maj 2026 · 05:28–07:01 (GPS saknades 93m)"
```
— inte längre amber "Behöver granskas".
