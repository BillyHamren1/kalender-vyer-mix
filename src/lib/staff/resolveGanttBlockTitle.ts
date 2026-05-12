import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

/**
 * Time Engine 2.13 — Gantt label resolver.
 *
 * Säkerställer att varje synligt Gantt-block alltid har en mänsklig title.
 * Fas-etiketten (RIGG/LAGER/TRANSPORT) är bara kategori — title-raden
 * måste alltid bära namn på platsen/projektet/bokningen.
 */

export type GanttBlockInput = ReportCandidateBlockUI & {
  // Optional rikare fält — finns om backend/admin layer har byggt display-blocks.
  displayTitle?: string | null;
  displaySubtitle?: string | null;
  projectName?: string | null;
  bookingName?: string | null;
  largeProjectName?: string | null;
  plannedAssignmentLabel?: string | null;
};

const GENERIC_TITLES = new Set(
  [
    '',
    'arbete',
    'arbete – okänd plats',
    'arbete - okänd plats',
    'arbete (okänd plats)',
    'work',
    'rigg',
    'rig',
    'rigdown',
    'rig down',
    'lager',
    'warehouse',
    'transport',
    'resa',
    'behöver granskas',
    'okänd plats',
    'unknown',
    'signal saknas',
    'signal_gap',
    'gps-glapp',
    'gps glapp',
    'sammanslagen okänd plats',
  ].map((s) => s.toLowerCase()),
);

const GENERIC_PREFIXES = ['sammanslagen okänd plats', 'okänd plats'];

// Time Engine 3.7 — Team är metadata, aldrig huvudtitel.
// "Team 1", "Team transport", "team-2", "Lager team" osv. ska aldrig vara title.
const TEAM_PATTERNS: RegExp[] = [
  /^team[\s\-_]/i,
  /^team\s*\d+$/i,
  /^team\s+(transport|rigg|rig|lager|warehouse|down)$/i,
  /^lager\s*team$/i,
];

const isGeneric = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const low = trimmed.toLowerCase();
  if (GENERIC_TITLES.has(low)) return true;
  if (GENERIC_PREFIXES.some((p) => low.startsWith(p))) return true;
  if (TEAM_PATTERNS.some((re) => re.test(trimmed))) return true;
  return false;
};

const isWarehouseEvidence = (b: GanttBlockInput): boolean => {
  const hay = `${b.title ?? ''} ${b.subtitle ?? ''} ${b.targetLabel ?? ''} ${b.displayTitle ?? ''}`.toLowerCase();
  return /\b(lager|warehouse|fa\s*warehouse)\b/.test(hay);
};

const fallbackForKind = (b: GanttBlockInput): string => {
  switch (b.kind) {
    case 'transport':
      return 'Resa';
    case 'needs_review':
      return 'Behöver granskas';
    case 'unknown':
      return 'Okänd plats';
    case 'break':
      return 'Rast';
    case 'work':
    default:
      if (isWarehouseEvidence(b)) return 'FA Warehouse';
      return 'Arbete – okänd plats';
  }
};

export type GanttTitleSource =
  | 'displayTitle'
  | 'projectName'
  | 'largeProjectName'
  | 'bookingName'
  | 'locationName'
  | 'warehouseName'
  | 'targetLabel'
  | 'plannedAssignmentLabel'
  | 'originalTitle'
  | 'fallback';

export type GanttBlockInputExtended = GanttBlockInput & {
  // Time Engine 3.7 — explicita källor (enrichment-fält).
  eventName?: string | null;
  locationName?: string | null;
  warehouseName?: string | null;
};

/**
 * Time Engine 3.7 — Title-prioritetsordning:
 *   1. displayTitle (explicit override)
 *   2. projectName / largeProjectName
 *   3. bookingName / eventName
 *   4. locationName / warehouseName
 *   5. targetLabel om mänskligt
 *   6. plannedAssignmentLabel
 *   7. originalTitle om mänskligt
 *   8. fallback per kind
 *
 * Team-strängar ("Team 1", "Team transport") räknas som generiska
 * och blockas redan i isGeneric → faller alltid igenom till nästa nivå.
 */
function pickResolved(
  block: GanttBlockInputExtended,
): { title: string; source: GanttTitleSource } {
  const ordered: Array<[string | null | undefined, GanttTitleSource]> = [
    [block.displayTitle, 'displayTitle'],
    [block.projectName, 'projectName'],
    [block.largeProjectName, 'largeProjectName'],
    [block.bookingName, 'bookingName'],
    [block.eventName, 'bookingName'],
    [block.locationName, 'locationName'],
    [block.warehouseName, 'warehouseName'],
    [block.targetLabel, 'targetLabel'],
    [block.plannedAssignmentLabel, 'plannedAssignmentLabel'],
    [!isGeneric(block.title) ? block.title : null, 'originalTitle'],
  ];
  for (const [val, src] of ordered) {
    if (val && !isGeneric(val)) return { title: val.trim(), source: src };
  }
  return { title: fallbackForKind(block), source: 'fallback' };
}

export function resolveGanttBlockTitle(block: GanttBlockInputExtended): string {
  return pickResolved(block).title;
}

/** Visa Time Engine 2.13/3.7 diagnostik live i devtools om block saknar namn. */
export function classifyGanttTitleResolution(
  block: GanttBlockInputExtended,
  resolved: string,
): GanttTitleSource {
  const picked = pickResolved(block);
  if (picked.title === resolved) return picked.source;
  return 'fallback';
}

export const __test__ = { isGeneric, fallbackForKind };
