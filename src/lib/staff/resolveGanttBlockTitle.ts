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

const isGeneric = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const low = trimmed.toLowerCase();
  if (GENERIC_TITLES.has(low)) return true;
  if (GENERIC_PREFIXES.some((p) => low.startsWith(p))) return true;
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

export function resolveGanttBlockTitle(block: GanttBlockInput): string {
  const candidates: Array<string | null | undefined> = [
    block.displayTitle,
    block.targetLabel,
    block.projectName,
    block.bookingName,
    block.largeProjectName,
    block.plannedAssignmentLabel,
    !isGeneric(block.title) ? block.title : null,
  ];

  for (const c of candidates) {
    if (c && !isGeneric(c)) return c.trim();
  }

  return fallbackForKind(block);
}

/** Visa Time Engine 2.13 diagnostik live i devtools om block saknar namn. */
export function classifyGanttTitleResolution(
  block: GanttBlockInput,
  resolved: string,
): 'displayTitle' | 'targetLabel' | 'assignment' | 'originalTitle' | 'fallback' {
  if (block.displayTitle && resolved === block.displayTitle.trim()) return 'displayTitle';
  if (block.targetLabel && resolved === block.targetLabel.trim()) return 'targetLabel';
  if (block.plannedAssignmentLabel && resolved === block.plannedAssignmentLabel.trim()) return 'assignment';
  if (block.title && !isGeneric(block.title) && resolved === block.title.trim()) return 'originalTitle';
  return 'fallback';
}

export const __test__ = { isGeneric, fallbackForKind };
