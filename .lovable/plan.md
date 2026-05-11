## Scope

Endast adminwebbens tidrapportmotor (`_shared/time-engine` + `get-staff-presence-day` + `backfill-staff-day-report-cache` + admin-vyns DecisionTrace). Inga writes. Ingen mobil. Ingen AI. Ingen ändring av rå GPS, geofence, sticky-regler eller andra personers data. Companion-rutt används endast som evidence — aldrig som kopierad rådata.

## Bakgrund

Föregående task (klassa korta GPS-gap i transportkedjor som `confirmed_transport_gap`) avbröts innan den implementerades. Denna task innehåller därför **båda** delarna i en sammanhållen leverans: bas-klassificeraren + companion-route som standard-evidence (inte sista utväg, inte AI-prerequisite).

## Nytt beteende

Ett gps_gap (≤30 min) inne i en tydlig transportkedja klassas som `confirmed_transport_gap` och absorberas i transportblocket. Adminvyn visar `Transport · A → B` med subtitle `GPS saknades N min · rutt bekräftad av M personer` (eller `GPS saknades N min under resan` om ingen companion finns). Ingen separat "Osäker period".

Companion-rutt blir första­hands­evidence: 1 stark match → high (0.90), 2+ matches eller 1+ destination bekräftad → very_high (0.95).

## Filer

```text
NY:    supabase/functions/_shared/time-engine/classifyTransportSignalGap.ts
NY:    supabase/functions/_shared/time-engine/findCompanionRouteEvidence.ts
ÄNDRA: supabase/functions/_shared/time-engine/buildPresenceDayBlocks.ts
ÄNDRA: supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts
ÄNDRA: supabase/functions/get-staff-presence-day/index.ts
ÄNDRA: supabase/functions/backfill-staff-day-report-cache/index.ts
ÄNDRA: src/components/staff/DecisionTraceDrawer.tsx   (nya rader för transport-gap evidence)
ÄNDRA: src/components/staff/ActualDayPanel.tsx        (warningLabel i transport-blockets subtitle)
NY:    src/test/transportSignalGap.contract.test.ts   (klassificerare + companion-regler)
```

Inga DB-migrations. Ingen ny tabell. Inga nya secrets.

## Tekniskt

### 1. `findCompanionRouteEvidence` (pure, no DB)

Helper får redan inläst `allStaffGpsTimeline: { staffId, staffName, pings: GpsPing[] }[]` (peers i samma org/dag) plus `assignments[]` (BSA + projekt­medlemskap för dagen).

Algoritm per peer:
1. Filtrera peer-pings till intervallet `[gapStart, gapEnd]`.
2. `coverageRatio` = (täckt minutspann med ping minst varje 5 min) / `gapMinutes`.
3. `routeStartDistanceMeters` = haversine(peer-första-ping-i-fönstret, `previousKnownPosition`).
4. `routeEndDistanceMeters` = haversine(peer-sista-ping-i-fönstret, `nextKnownPosition`).
5. `sameDirectionLikely` = peer rör sig från start-area mot end-area (cosine av rikt­nings­vektorer ≥ 0.3).
6. `sameProjectOrTeam` = peer delar antingen `previousTarget` eller `nextTarget` i sina assignments.
7. `averageSpeedKmh` = peer-distans / peer-tid i fönstret.

Match-kriterier för en peer:
- `coverageRatio >= 0.5`
- `routeStartDistanceMeters <= 1000`
- `routeEndDistanceMeters <= 1000`
- `sameDirectionLikely === true`
- `averageSpeedKmh` mellan 5 och 130

Confidence-rollup:
- 0 matches → `{ matched: false, confidence: 'low', confidenceScore: 0 }`
- ≥1 match + `sameProjectOrTeam` → `high (0.90)`
- ≥2 matches OR (1 match + nextTarget är warehouse/projekt/booking/location) → `very_high (0.95)`
- Geografi OK men inget projekt/team-stöd → `medium (0.70)`
- Bara svag geografisk likhet → `low (0.40)`

### 2. `classifyTransportSignalGap` (pure, no DB)

Input:
```ts
{
  previousBlock, gapBlock, nextBlock,
  previousKnownPosition, nextKnownPosition,
  destinationCandidate,                     // resolveWorkTargets-träff på nextKnownPosition
  conflictingSignals,                       // pre-evaluerade: anyHardGeoEntry, anyConfirmedStay, anyHomePrivate
  companionRouteEvidence                    // resultat av findCompanionRouteEvidence
}
```

Output:
```ts
{
  classification: 'confirmed_transport_gap' | 'probable_transport_gap' | 'unknown_gap_needs_review';
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  confidenceScore: number;     // 0..1
  countsAsTransport: boolean;
  reasons: string[];           // t.ex. 'short_signal_gap_inside_confirmed_route', 'multi_staff_route_confirmation'
  warningLabel: string;        // sv. text för UI
  destinationEvidence: { label, targetType, targetSource, isWorkRelated, confidence } | null;
  companionRouteEvidence: { matched, confidence, confidenceScore, matchedStaffCount, matchedStaff, reasons };
  impliedSpeedKmh: number | null;
  gapMinutes: number;
}
```

Beslutslogik:
1. Hard reject om någon `conflictingSignals.*` är true → `unknown_gap_needs_review`.
2. Hard reject om `gapMinutes > 30` → `unknown_gap_needs_review`.
3. Hard reject om saknas pre/post own GPS → `unknown_gap_needs_review`.
4. Implied speed (`distanceMeters / gapMinutes`) måste vara 5–130 km/h om distans > 500 m.
5. Confidence-pyramiden:
   - companion `very_high` → `confirmed_transport_gap` confidence `very_high` 0.95, reason `multi_staff_route_confirmation`.
   - companion `high` ELLER (destinationCandidate isWorkRelated + transport på båda sidor) → `confirmed_transport_gap` confidence `high` 0.90, reason `short_signal_gap_inside_confirmed_route` (+ companion reason om matchad).
   - companion `medium` ELLER (transport på båda sidor utan destinationsstöd) → `probable_transport_gap` confidence `medium` 0.70.
   - annars → `unknown_gap_needs_review`.
6. `warningLabel`:
   - 0 companions: `"GPS saknades {N} min under resan"`
   - 1 companion: `"GPS saknades {N} min · rutt bekräftad av annan personal"`
   - ≥2 companions: `"GPS saknades {N} min · rutt bekräftad av {M} personer"`

### 3. Integration i `buildPresenceDayBlocks`

I `if (seg.kind === 'gps_gap')`-grenen, **före** dagens `uncertain_transition`/`signal_gap`-emit:

- Hämta closest travel/known-arrival före och efter gapet (utöka `findPrev/NextStableStay` med `findPrev/NextTransportOrKnownAnchor`).
- Bygg `conflictingSignals` från befintliga segment i fönstret.
- Bygg `companionRouteEvidence` (kräver att `BuildPresenceDayBlocksInput` får ett nytt valfritt fält `peerGpsTimelines?: PeerGpsTimeline[]` + `assignments?: AssignmentLite[]` — se nästa punkt).
- Kör `classifyTransportSignalGap`.
- Om `countsAsTransport === true`: emittera `kind: 'transport'`-block med:
  - `confidence: 'high' | 'medium'` (very_high mappas till high i contracts som inte har very_high — confidenceScore lagras separat i evidence)
  - `confidenceReason: 'short_signal_gap_inside_confirmed_route'` / `'multi_staff_route_confirmation'`
  - `evidence`: hela classifier-outputen + `signalGapMinutes`, `confidenceScore`, `companionRouteEvidence`
  - `warningLabel` på block-nivå (nytt fält i `PresenceDayBlock.evidence.warningLabel`).
- Annars: nuvarande beteende (signal_gap / uncertain_transition).

Befintlig `aggregateEvidenceBlocks` slår ihop intilliggande transportblock — gap-blocket smälter därför in i resan automatiskt. Vi propagerar `warningLabel` + `companionRouteEvidence` till det aggregerade transport-rapport-blocket via `host.evidenceSummary`.

### 4. Peer GPS feed

`get-staff-presence-day` och `backfill-staff-day-report-cache` hämtar peer-pings för hela orgen för dagen, paginerat (samma 1000-batch + `PING_DAY_CAP`-mönster som redan finns för Armands-fixen). Filter:
- `organization_id = req.organization_id`
- `recorded_at` inom dagen (lokal tid → UTC-fönster)
- `staff_id != current.staffId`

Trimma till peers som faktiskt har minst en ping inom någon av staff-personens upptäckta gap-fönster (cheap pre-filter).

Assignments byggs en gång per request via befintlig `resolveWorkTargets` + en lättviktig BSA-läsning (`booking_staff_assignments` join `bookings` på dagen + `staff_assignments` join `large_project_team_assignments` på dagen).

### 5. Diagnostics

Båda funktionerna returnerar:

```ts
signalGapTransportDiagnostics: {
  confirmedTransportGapCount, confirmedTransportGapMinutes,
  probableTransportGapCount, probableTransportGapMinutes,
  remainingUnknownTransportGapCount, remainingUnknownTransportGapMinutes,
  destinationConfirmedCount,
  examples: [...]
},
companionRouteDiagnostics: {
  confirmedByCompanionRouteCount, confirmedByCompanionRouteMinutes,
  veryHighConfidenceCount, highConfidenceCount, mediumConfidenceCount, lowConfidenceCandidateCount,
  unbridgedGapCount,
  examples: [...]
}
```

Sätts i `staff_day_report_cache.diagnostics_json.signalGapTransport` och `.companionRoute`.

### 6. UI

- `ActualDayPanel.tsx`: lägger till en gul subtitle på transport-block där `evidence.warningLabel` finns. Inga nya kind-värden — UI ser det som ett vanligt transport-block.
- `DecisionTraceDrawer.tsx`: ny sektion "GPS-gap i transport" som renderar `classifyTransportSignalGap`-outputens fält när blocket har det. Companion-listan renderas som tabell med staffName, overlapMinutes, coverageRatio, sameProjectOrTeam.

### 7. Test

`src/test/transportSignalGap.contract.test.ts` täcker:
- gap utan companion + destination = warehouse → confirmed_transport_gap high.
- gap med 2 companions, ingen destination → confirmed_transport_gap very_high.
- gap med 1 companion utan project-team → medium → probable.
- gap > 30 min → unknown.
- gap med konflikt (geo_entry på annan plats under fönstret) → unknown.
- companion finns men coverageRatio < 0.5 → räknas inte som match.
- routeEndDistanceMeters > 1000 → räknas inte som match.

## Verifiering 2026-05-09

1. Deploya båda edge-funktionerna.
2. Anropa `backfill-staff-day-report-cache` med `force:true, dryRun:false` för Markuss Minalto + Armands Birznieks (date `2026-05-09`).
3. Hämta `report_candidate_blocks_json` + `diagnostics_json` via `supabase--read_query`.
4. Bekräfta:
   - **Markuss**: ~17-min "Osäker period" är borta. Transport-blocket har `evidence.warningLabel = "GPS saknades 17 min · rutt bekräftad av {M} personer"` (M ≥ 1 om Armands eller annan peer hade matchande pings) eller `"… under resan"` (om ingen peer matchade). `signalGapTransportDiagnostics.confirmedTransportGapCount` ≥ 1.
   - **Armands**: oförändrad (han hade egna pings — inget gap att klassa). Diagnostics `companionBoostedCount` 0 för honom.
5. Säkerhets-assert i backfill-svaret: `wroteOnlyTo: 'staff_day_report_cache'`. Inga writes till `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `gps_pings`. Ingen AI-anrop.

## Out of scope

- Inga nya block-kinds uppåt mot UI (det är fortfarande `transport`).
- Ingen ändring av motståndet `gapMinutes > 30` (gap över 30 min förblir needs_review även med companion).
- Inga nya tabeller/migrations.
- Ingen `decision_trace`-persistens — drawern läser direkt från cache-blockets `evidence`.
- Ingen ändring av befintlig AI-pipeline; companion ersätter inte AI:s analys av övriga oklara segment, den prioriteras bara före AI för transportgap.
