# Fix 1 — Syntax och target-metadata för tidrapport-display

Sju små, isolerade fixar. Endast frontend + två edge-fält. Inga writes, ingen AI, inget i mobilappen.

---

## Filer som rörs

1. `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts`
2. `supabase/functions/get-staff-presence-day/index.ts`
3. `src/lib/staff/buildReportDisplayBlocks.ts`
4. `src/components/staff/ReportCandidateTimeline.tsx`

---

## 1. Stäng `interface AiReviewContext`

`buildReportCandidateBlocks.ts` rad 105–117 saknar avslutande `}`. Idag glider definitionen rakt in i `ReportCandidateSummary` på rad 118 — bara `// @ts-nocheck` döljer felet. Lägg in `}` på en egen rad direkt efter `currentPlannedAssignments: string[];`.

## 2. Berika target-mapping i `get-staff-presence-day`

I rad 757–770 mappas `resolvedTargetsAll` till response. `resolveWorkTargets.ts` exponerar redan `matchRole`, `assignmentAnchor`, `canAutoMatchAsWork`, `addressAnchorKey`, `rawAddress` på varje target. Lägg till de fem fälten i mappningen, ovanför `notes`:

```ts
matchRole: r.matchRole,
assignmentAnchor: r.assignmentAnchor,
canAutoMatchAsWork: r.canAutoMatchAsWork,
addressAnchorKey: r.addressAnchorKey,
rawAddress: r.rawAddress,
```

Inga andra ändringar i edge-funktionen.

## 3. Justera `TargetLite` i `buildReportDisplayBlocks.ts`

Rad 49–59. Ersätt `dateRelevance` med string-formen som backend faktiskt skickar och lägg till de nya fälten:

```ts
export interface TargetLite {
  id: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number | null;
  timeTrackingAllowed?: boolean | null;
  dateRelevance?: 'today' | 'recent' | 'permanent' | 'unknown' | null;
  matchRole?: 'primary' | 'secondary' | null;
  assignmentAnchor?: string | null;
  canAutoMatchAsWork?: boolean | null;
  addressAnchorKey?: string | null;
  rawAddress?: string | null;
  targetSource?: string | null;
}
```

## 4. Klassa primary/secondary från backendfält, inte `dateRelevance.relevant`

Rad 163–169. Ersätt `primarySet`-blocket med:

```ts
const primaryTargets = allTargets.filter(
  (t) => t.matchRole === 'primary' && t.canAutoMatchAsWork === true,
);
const secondaryTargets = allTargets.filter(
  (t) => !(t.matchRole === 'primary' && t.canAutoMatchAsWork === true),
);
```

Inga övriga rader som idag läser `primarySet` ska vara kvar — `primaryTargets`/`secondaryTargets` används redan nedanför.

## 5. Sätt `nearestSecondaryCandidateAddress` (och primary motsvarighet) från target

Rad 188–212.
- Ändra `const nearestSecondaryCandidateAddress: string | null = null;` → `let nearestSecondaryCandidateAddress: string | null = null;`
- Lägg till en motsvarande `let nearestPrimaryTargetAddress: string | null = null;` bredvid label/distance-deklarationerna.
- I `if (bestP)`: `nearestPrimaryTargetAddress = bestP.t.rawAddress ?? bestP.t.name ?? null;`
- I `if (bestS)`: `nearestSecondaryCandidateAddress = bestS.t.rawAddress ?? bestS.t.name ?? null;`

`LocationEvidence` har redan `nearestSecondaryCandidateAddress`. Lägg till `nearestPrimaryTargetAddress: string | null;` i interfacet och fyll i båda byggnaderna av `locationEvidence` (rad 217–246).

## 6. Skicka `staffName` / `date` från `ReportCandidateTimeline`

`src/components/staff/ReportCandidateTimeline.tsx`:
- Lägg `staffName?: string | null;` och `date?: string | null;` i `ReportCandidateTimelineProps`.
- Plocka ut dem i komponentens `props`.
- Skicka vidare till `buildReportDisplayBlocks({ blocks, presenceBlocks, targets, staffName, date })`.

Inga call-sites behöver ändras — props är frivilliga.

## 7. Städa oanvända imports

I `ReportCandidateTimeline.tsx`:
- Ta bort `import { format } from 'date-fns';` (rad 17) — `format(` förekommer inte i filen.
- Behåll `formatStockholmHm` och `formatStockholmHms` — `formatStockholmHms` används i `EvidencePanel` rad 123/124/127/130. Ingen ändring där.

---

## Efter ändring

- Inga DB-writes, ingen AI-anrop, ingen mobilkod-ändring.
- Bygget körs automatiskt av harness; jag rapporterar eventuella TS/lint-fel direkt.
- Ingen testdata behövs — ändringarna är typer + ren mappning.

## Risker

- `buildReportDisplayBlocks` läser nu `matchRole`/`canAutoMatchAsWork` från backend; gamla snapshots/cache som inte har fälten klassas som secondary (säker fallback — inget blir auto-arbete utan explicit primary).
- `get-staff-presence-day` lägger till fem fält i sin response → bredare payload, men bakåtkompatibelt.
