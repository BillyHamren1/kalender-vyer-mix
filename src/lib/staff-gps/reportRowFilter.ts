// reportRowFilter.ts
// ==================
// Ren presentations-filter ovanpå GPS-partitionen. Konverterar råa DaySegment[]
// till rena rapport-rader för veckopanelens "Tidrapport"-läge.
//
// Regler:
//  - Endast `work` och "riktig" `travel` får överleva som rapport-rader.
//  - Travel där fromLabel === toLabel filtreras bort (intern rörelse i samma site).
//  - Travel < 5 min filtreras bort (mikrostopp).
//  - Allt före första work / efter sista work kapas (nattliga unknown_place,
//    privat-block och hem-rörelse hamnar i underlag istället).
//  - Kontigt eller sandwich-uppdelade `work`-block med samma target-label slås
//    ihop till EN rad (start = första work-start, end = sista work-end).
//    workMin för raden = summa av faktiska work-minuter (mellanliggande dolda
//    minuter räknas INTE som arbete).
//  - Mellanliggande `travel` med fromLabel===toLabel mellan två work-block med
//    samma target absorberas också (samma target på båda sidor → drift, inte
//    riktig resa).
//
// Inga DB-anrop, ingen DOM. Pure-funktion → enkel att enhetstesta.

import type { DaySegment, SegmentType } from "./dayPartition";

export interface ReportSummary {
  workMin: number;
  travelMin: number;
  hiddenEvidenceMin: number;
  hiddenEvidenceKinds: SegmentType[];
  mergedSameTargetRowsCount: number;
  visibleReportRowsCount: number;
  hiddenEvidenceRowsCount: number;
  reportSourceUsed: "gps_partition_filtered";
}

const MIN_VISIBLE_TRAVEL_MIN = 5;

function isSameTargetTravel(s: DaySegment): boolean {
  if (s.type !== "travel") return false;
  const from = (s.fromLabel ?? "").trim().toLowerCase();
  const to = (s.toLabel ?? "").trim().toLowerCase();
  return !!from && !!to && from === to;
}

function workKey(s: DaySegment): string {
  // Föredra knownSiteId, annars label (case-insensitive).
  if (s.knownSiteId) return `id:${s.knownSiteId}`;
  return `lbl:${(s.label ?? "").trim().toLowerCase()}`;
}

/**
 * Filtrerar och kollapsar segment till rena rapport-rader.
 * Returnerar en lista där varje rad själv är ett DaySegment-liknande objekt;
 * minutes är summa av faktiska work-minuter (för work-block), eller travel-
 * minuter (för travel-block).
 */
export function toReportRows(segments: DaySegment[]): DaySegment[] {
  if (!segments || segments.length === 0) return [];

  // 1) Plocka kandidater i kronologisk ordning.
  const candidates = segments.filter((s) => {
    if (s.type === "work") return true;
    if (s.type === "travel") {
      if (isSameTargetTravel(s)) return false;
      if (s.minutes < MIN_VISIBLE_TRAVEL_MIN) return false;
      return true;
    }
    // gps_gap / unknown_place / idle / private → aldrig egna rader
    return false;
  });

  if (candidates.length === 0) return [];

  // 2) Kapa leading/trailing icke-work.
  let firstWorkIdx = candidates.findIndex((s) => s.type === "work");
  let lastWorkIdx = -1;
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i].type === "work") { lastWorkIdx = i; break; }
  }
  if (firstWorkIdx === -1 || lastWorkIdx === -1) return [];
  const trimmed = candidates.slice(firstWorkIdx, lastWorkIdx + 1);

  // 3) Slå ihop sammanhängande work med samma target.
  //    En travel mellan dem som är same-target ska redan vara filtrerad bort,
  //    men för säkerhets skull: när nästa rad är work med samma key som
  //    aktuell pågående work-grupp → utöka gruppen, även om travel ligger
  //    emellan (vi sväljer den travel-raden då).
  const result: DaySegment[] = [];
  let pending: DaySegment | null = null;
  let pendingWorkMinutes = 0;

  const flushPending = () => {
    if (pending) {
      result.push({ ...pending, minutes: pendingWorkMinutes });
      pending = null;
      pendingWorkMinutes = 0;
    }
  };

  for (let i = 0; i < trimmed.length; i++) {
    const seg = trimmed[i];
    if (seg.type === "work") {
      if (pending && workKey(pending) === workKey(seg)) {
        // Utöka gruppen
        pending = { ...pending, end: seg.end };
        pendingWorkMinutes += seg.minutes;
      } else {
        flushPending();
        pending = { ...seg };
        pendingWorkMinutes = seg.minutes;
      }
    } else {
      // travel-rad: kolla om föregående pending-work-key === nästa work-key
      // → då absorberas travel i pending (drift, inte riktig resa).
      const next = trimmed[i + 1];
      if (
        pending &&
        next &&
        next.type === "work" &&
        workKey(pending) === workKey(next)
      ) {
        // svälj travel: utöka pending end framåt, hoppa över denna travel
        pending = { ...pending, end: seg.end };
        continue;
      }
      flushPending();
      result.push({ ...seg });
    }
  }
  flushPending();

  return result;
}

export function summarizeReportRows(
  rows: DaySegment[],
  original: DaySegment[],
): ReportSummary {
  let workMin = 0;
  let travelMin = 0;
  for (const r of rows) {
    if (r.type === "work") workMin += r.minutes;
    else if (r.type === "travel") travelMin += r.minutes;
  }
  const visibleStarts = new Set(rows.map((r) => `${r.start}|${r.end}|${r.type}`));
  let hiddenEvidenceMin = 0;
  const hiddenKinds = new Set<SegmentType>();
  let hiddenCount = 0;
  for (const s of original) {
    const key = `${s.start}|${s.end}|${s.type}`;
    if (visibleStarts.has(key)) continue;
    if (s.type === "idle") continue;
    if (s.type === "work" || s.type === "travel") {
      // work som mergeats in i en annan rad ska räknas som dolt underlag-bidrag,
      // men inte som "förlorad arbetstid" — workMin reflekterar faktiska work-minuter.
      // Vi tar bara med icke-arbete & icke-synliga travels.
      if (s.type === "work") continue;
      // travel som filtrerats bort (same-target / micro)
    }
    hiddenEvidenceMin += s.minutes;
    hiddenKinds.add(s.type);
    hiddenCount += 1;
  }

  // mergedSameTargetRowsCount = antal work-segment i original – antal work-rader i result.
  const origWorkCount = original.filter((s) => s.type === "work").length;
  const visibleWorkCount = rows.filter((r) => r.type === "work").length;
  const mergedSameTargetRowsCount = Math.max(0, origWorkCount - visibleWorkCount);

  return {
    workMin,
    travelMin,
    hiddenEvidenceMin,
    hiddenEvidenceKinds: Array.from(hiddenKinds),
    mergedSameTargetRowsCount,
    visibleReportRowsCount: rows.length,
    hiddenEvidenceRowsCount: hiddenCount,
    reportSourceUsed: "gps_partition_filtered",
  };
}
