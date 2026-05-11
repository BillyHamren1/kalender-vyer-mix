# Fix – "Resa"-block trots att personen står still

## Diagnos

Nej, motorn ska inte producera "Resa" här. Det är en bugg på två ställen där ett `signal_gap` (tyst GPS) promotas till `transport` **utan att verifiera personens egen rörelse**.

### Bugg #1 — `buildPresenceDayBlocks.ts:583-636`
"Companion-route confirmation" / "transport_anchors_both_sides":
- När en kollegas GPS visar förflyttning under glappet → glappet stämplas som `transport` på den här personen också.
- När en "anchor" finns på båda sidor (rörelse precis före/efter) → glappet stämplas som `transport`.
- Ingen check görs mot **den aktuella staffens** egna pingar närmast glappet. Står de still på samma koordinat blir det ändå "Resa".

### Bugg #2 — `buildReportCandidateBlocks.ts:927-950`
"Bridged-trip promotion":
- När ett glapp ligger mellan två olika kända targets → automatiskt `transport`, ingen distance-check (kommentaren erkänner detta: `vi har inget mätt avstånd här`).
- Räcker att target-resolvern råkar mappa pre/post-glapp till olika labels (t.ex. boende-poly saknas och pings tilldelas Warehouse vs okänd plats) för att en obefintlig resa ska skapas.

### Bugg #3 (relaterad)
`buildGpsDayTimeline` enforcear redan `TRANSPORT_MIN_DISTANCE_METERS` på riktiga `travel`-runs (Motor 4). Men gap→transport-promotionen ovan körs i **presence- och report-lagren**, **efter** att GPS-lagrets distansgate redan passerat. Motor 4-skyddet bryts därför.

## Fix – håll regeln "≥ 500 m egen rörelse, annars aldrig transport"

Inga UI-ändringar, inga writes till `time_reports`, ingen radering, ingen ändring av rådata. Endast skärpning av två klassningsregler.

### Steg 1 — Ny gemensam helper

`supabase/functions/_shared/time-engine/staffOwnDisplacement.ts` (+ frontend-spegel under `src/lib/time-engine/`).

```typescript
export function staffOwnDisplacementMeters(
  prevPing: { lat: number; lng: number } | null,
  nextPing: { lat: number; lng: number } | null,
): number | null
```

Returnerar haversine mellan sista pingen före glappet och första pingen efter glappet på **samma staff**. `null` om någon sida saknas.

### Steg 2 — Hård gate i `buildPresenceDayBlocks.ts`

I companion/anchor-promotionen (rad ~583-636), innan blocket pushas som `transport`:

```typescript
const ownDisp = staffOwnDisplacementMeters(prevOwnPing, nextOwnPing);
if (ownDisp != null && ownDisp < TRANSPORT_MIN_DISTANCE_METERS) {
  // Personen står stilla i sin egen GPS → får ALDRIG bli transport,
  // oavsett vad kollegor eller anchors säger.
  blocks.push(mkSignalGap(newId('signal_gap'), seg, prevStable, nextStable, 'GPS tyst på samma plats'));
  i += 1;
  continue;
}
```

Lägg till diagnostik-räknare `staffStationaryGapDemotedFromTransport` så vi kan följa hur ofta det triggas.

### Steg 3 — Hård gate i `buildReportCandidateBlocks.ts`

I bridged-trip-promotion (rad 934-950), kräv mätt distans innan vi tillåter `transport`:

```typescript
if (prevKnown && nextKnown && prevKey !== nextKey) {
  const measured = b.evidence?.staffOwnDisplacementMeters; // bubblat upp från presence-lagret
  if (measured == null || measured < TRANSPORT_MIN_DISTANCE_METERS) {
    // Targets skiljer sig på etikett, men personen rörde sig inte.
    // Vanligast: saknad private_residence-polygon gör att hemma matchas
    // mot Warehouse på ena sidan av glappet.
    candidate.reviewReasons.add('targets_differ_without_movement');
    // … fortsätt som needs_review, INTE transport
  } else {
    // genuin A→B-resa, behåll dagens promotion
  }
}
```

### Steg 4 — Bubbla `staffOwnDisplacementMeters` genom evidence

`buildPresenceDayBlocks` lägger redan distansvärden i `evidence`. Lägg till `staffOwnDisplacementMeters` på `signal_gap`, `uncertain_transition` och alla transport-block. `buildReportCandidateBlocks` läser sen från `b.evidence`.

### Steg 5 — Tester

Lägg till Deno-tester i `_shared/time-engine/__tests__/` (eller motsvarande):

1. **stationary_companion_promotion** — staff har 0 m rörelse, kollega har 12 km route. Förvänta `signal_gap`, **inte** `transport`.
2. **stationary_anchor_promotion** — staff har anchors båda sidor men 0 m egen rörelse. Förvänta `signal_gap`.
3. **stationary_bridged_trip** — gap mellan target A och target B, men staffens egna pings 8 m isär. Förvänta `needs_review` med `targets_differ_without_movement`, **inte** `transport`.
4. **real_500m_trip** — staff rör sig 800 m mellan A och B → fortfarande `transport` (regression-skydd).
5. **residence_then_warehouse** — pings i private_residence, glapp, pings tillbaka i samma residence. Förvänta `signal_gap` även om Warehouse ligger 200 m bort.

### Steg 6 — Inga rebuilds krävs nu

Cachen invalideras automatiskt när `input_signature` ändras (motorlogiken är input). Existerande dagar byggs om vid nästa öppnande/dirty-trigger. Inget mass-jobb behövs.

## Vad fixet INTE rör

- Rådata i `gps_pings` / `staff_locations` — orört
- `time_reports` / `workday` / lönedata — orört
- `analyze-unclear-segment` (AI) — orört, regelmotorn ska klara det här utan AI
- UI-komponenter, mobilapp, snapshots — orört
- `buildGpsDayTimeline` Motor 4-distansgaten — orört, fortfarande aktiv

## Filer som ändras

- `supabase/functions/_shared/time-engine/staffOwnDisplacement.ts` (ny)
- `src/lib/time-engine/staffOwnDisplacement.ts` (ny, spegel)
- `supabase/functions/_shared/time-engine/buildPresenceDayBlocks.ts` (gate i promotion)
- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` (gate i bridged-trip)
- Tester under `_shared/time-engine/__tests__/`

## Effekt på dina skärmbilder

- Block "TRANSPORT Resa 15:31–16:26", "1h 6m", "1h 17m", "1h 1m", "1h 2m", "23m" osv. där pingsen ligger på samma koordinat → blir `signal_gap` (visas som ett ljust, ej-fakturerbart "GPS tyst")
- "GRANSKA Behöver granskas" som triggades av `missing_transition_evidence` mellan icke-skiljande platser → får ny review-reason `targets_differ_without_movement` och försvinner helt om bostaden markeras som `private_residence`
- "OKÄND PLATS 21:24–23:27" — oförändrat, det är korrekt klassning för pings utan target eller residence (lös via residence-polygon)
