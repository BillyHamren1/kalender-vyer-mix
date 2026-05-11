## Vad du faktiskt ser

Det är inte ett "events" som dubblas — det är att tidslinjen i `/staff-management/time-reports` (`StaffGanttView.tsx`) lägger ALLA candidate-block i samma kolumn med `absolute left:1 right:1` och positionerar dem efter start/sluttid. Två block som överlappar i tid hamnar då bokstavligen ovanpå varandra. Inget "lane-läge" finns idag.

Två separata problem driver det du ser i screenshoten:

### Problem A — Motorn spottar ur sig FÖR MÅNGA block

Markus 2026-05-09 har just nu **37 candidate-blocks** på en enda dag i den senaste cachen. Tidigare versioner gav 14–24:

```
v2.6-open-active-consolidation   37 blocks   (senaste, det du ser)
v1                               14
v1-companion-test2               24
v2.5-sandwich-inferred-work      20
v2.4-prework-home-geofence       20
```

Dvs. den nya POST-PASS 4 (öppen aktiv registrering konsoliderar släpljus) **gör inget** för historiska dagar utan öppen timer — men något annat i samma deploy har samtidigt tappat den dedup som tidigare slog ihop intilliggande GRANSKA + TRANSPORT runt samma punkt. Det är därför du får sekvensen `TRANSPORT 11m → TRANSPORT 1h1m → GRANSKA 38m → TRANSPORT 41m → GRANSKA 15m → TRANSPORT 5m → TRANSPORT 12m → TRANSPORT 5m → GRANSKA 1h49m`.

### Problem B — Cachen har 6 rader för samma dag

`staff_day_report_cache` är unik på `(organization_id, staff_id, date, engine_version)`. Varje gammal `engine_version` ligger kvar. För Markus 2026-05-09 finns 6 rader. Hooks läser senaste built_at, men alla gamla rader kostar plats och förvirrar diagnos. Vi borde inte heller versionsdriva persistens på det sättet — antingen pinna till EN aktiv version och radera resten, eller inte ha `engine_version` i unique key.

### Problem C — Gantten har inga lanes

Även när motorn är korrekt: om två block överlappar i tid kommer de fortsatt att stapla. Idag finns ingen lane/kolumndelning i `StaffGanttView.tsx` (rad 887–939).

---

## Plan (3 steg, inga raderingar av data utan godkännande)

### Steg 1 — Diagnos av v2.6-explosionen (ingen kodändring)
Plocka ut Markus 2026-05-09 från cachen och dumpa alla 37 blocks (kind, start, slut, target, reviewReasons) plus motsvarande `presence_day_blocks` och `signal_gaps` från diagnostics. Verifiera vilken regel som tappat dedup mellan v2.5 (20 block) och v2.6 (37 block). Mest sannolikt:
- POST-PASS som slog ihop `same_target_roundtrip_distance_too_large`-transporter med intilliggande needs_review körs inte längre när öppen timer-kontexten saknas.
- Eller: nya `isOngoing`-flaggan har av misstag ändrat ett tidigare merge-villkor.

### Steg 2 — Återställ dedup i `buildReportCandidateBlocks.ts`
När det finns INGEN öppen aktiv registrering ska motorn bete sig EXAKT som v2.5. POST-PASS 4 ska tidigt `return` om `openActiveRegistration` saknas, utan att röra övriga pass. Återinför gärna också mergeRegeln "TRANSPORT < `realTripMinDistanceMeters` mellan två needs_review med samma target → absorbera in i needs_review" som no-op-fall även utan öppen timer.

Inget skrivs till `time_reports`, `workdays`, `location_time_entries` eller `travel_time_logs`. Endast read-cache påverkas.

### Steg 3 — Cache-hygien
Två val (jag väntar på ditt svar):
1. **Pinna en aktiv version**: lägg `STAFF_DAY_REPORT_CACHE_ENGINE_VERSION` som env, läshooks filtrerar på den, gamla rader får ligga kvar tills vi senare rensar.
2. **Ta bort `engine_version` ur unique key**: backfill upsertar då ovanpå gammal rad. Kräver migration + en städning av befintliga dubbletter.

### (Inte i denna plan — meddela om du vill ha det)
- Lane-rendering i `StaffGanttView` så ev. legitima överlapp visas sida vid sida istället för att stapla. Det är en ren UI-ändring och rör inte motorn.

---

## Tekniska filer som berörs i steg 1–2

- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` (POST-PASS 4 + closed-day guard)
- `supabase/functions/get-staff-presence-day/index.ts` (read-only, ingen ändring)
- `supabase/functions/backfill-staff-day-report-cache/index.ts` (för omkörning Markus 2026-05-09 efter fix)

## Frågor innan jag implementerar

1. Vill du att jag bara börjar med Steg 1 (diagnos-dump i chatten) eller kör Steg 1+2 direkt?
2. Vilken cache-strategi i Steg 3: pinna version (snabbt) eller migrera bort `engine_version` ur unique-nyckel (renare)?
3. Ska jag även lägga in lane-rendering i gantten, eller är det ok att överlapp staplas så länge motorn är korrekt?