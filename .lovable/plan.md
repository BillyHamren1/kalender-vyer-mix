## Problem

Två separata regressioner i samma vy (`/staff-management/time-reports`):

### 1. Bergman-dagen splittras i tre block
Skärmbild visar:
- 06:58–10:32 Bergman (granska, `signal_gaps_inside_work_block`)
- 10:33–10:49 Bergman 16 min (`same_target_roundtrip_distance_too_large · inferred_from_neighbors`)
- 10:50–12:11 Bergman (granska, `signal_gaps_inside_work_block`)

Allt är samma plats (Bergman) hela tiden. Splitten kommer från `buildReportCandidateBlocks.ts` rad ~1227–1230: när en transport-segment har samma target på båda sidor men avstånd > `sameTargetTransportAbsorbMaxDistanceMeters`, flippas den till `needs_review` istället för att absorberas. Det skär arbetsblocket i tre delar.

### 2. "Trolig resa · FA Warehouse → Bergman Event AB" är fortfarande gul
Förra fixen gällde bara enstaka cachade `needs_review`-block via `isReview`-grenen. Den här raden produceras av den tidigare grenen i `buildReportDisplayBlocks.ts` (rad ~601–687) där flera osäkra block grupperas. `promoteAsBridgedTrip` byter bara titel/subtitle — `kind` står kvar som `needs_review` och `reviewState='needs_review'`, så raden renderas som "granska / låg konfidens".

## Fix

### A. `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` (~rad 1199–1246)

Ändra `same_target_roundtrip` från flip-to-review till **soft absorb**:
- Om `prev.target == next.target` och transport-segmentet är ≤ `sameTargetTransportAbsorbMaxMinutes`: absorbera ALLTID in i föregående work-block (`absorbInto(prev, cur); absorbInto(prev, next)`), oavsett distans.
- När `dist > sameTargetTransportAbsorbMaxDistanceMeters`: lägg till `same_target_roundtrip_long_distance` som review-reason på det sammanslagna work-blocket (mjuk varning, inte block-split).
- Behåll `same_target_transport_missing_distance`-grenen som soft-warning (absorbera + flagga), istället för "kept as transport".

Resultat: Bergman-dagen visas som ETT block 06:58–12:11 med eventuell granska-flagga.

### B. `src/lib/staff/buildReportDisplayBlocks.ts` (~rad 646–686)

I `merged`-objektet, när `promoteAsBridgedTrip === true`:
- `kind: 'transport'` (inte `needs_review`)
- `reviewState: 'ok'`
- `confidence: promotedConfidence` (high om ≤10 min gap, annars medium)
- `warningLabel`: liten "GPS saknades X min"-text (inte granska-flagga)
- `displayTitle: 'Resa'`, `displaySubtitle: '${prevKnown} → ${nextKnown} · GPS saknades ~X min'`

Det gör att grupperade A→B-resor renderas som grön transport-rad i timeline (samma som enstaka cachade fall efter förra fixen).

### C. Inga andra ändringar
- Inga DB-skrivningar, inga edge function-deploys utöver A.
- Inga ändringar i `time_reports`/lön/`create_travel_from_gap`.
- Inga AI-anrop.
- Cache rebuildas live på admin-sidan, så ingen backfill behövs.

## Tekniska detaljer

**Filer:**
- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` — ändra `sameTargetCandidate`-grenen så `flipToNeedsReview` ersätts med absorb + soft reason.
- `src/lib/staff/buildReportDisplayBlocks.ts` — uppdatera `merged.kind/reviewState/confidence/displayTitle/displaySubtitle` för `promoteAsBridgedTrip`.

**Inte i scope:**
- Den övre Bergman-raden 06:58–10:32 har egen `signal_gaps_inside_work_block`-flagga från work-block-bridging (rad 806–807). Den fortsätter vara "granska" tills användaren ber om det — bara split-problemet löses här.

## Verifiering
- Build passerar.
- Kontrollera Markus 12 maj-vy: en sammanhängande Bergman-rad + grön "Resa · FA Warehouse → Bergman".
