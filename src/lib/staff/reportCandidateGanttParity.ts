import {
  buildReportDisplayBlocks,
  type DisplayBlock,
  type PresenceBlockLite,
  type TargetLite,
} from '@/lib/staff/buildReportDisplayBlocks';
import type { ReportBlockKind, ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

export const ADMIN_GANTT_VISIBLE_REPORT_KINDS = new Set<ReportBlockKind>([
  'work',
  'transport',
  'unknown',
  'needs_review',
]);

export type SuggestedDisplayGanttKind = 'work' | 'transport' | 'unknown' | 'review';

export interface SuggestedDisplayGanttBlock extends DisplayBlock {
  ganttKind: SuggestedDisplayGanttKind;
  source: 'reportCandidate';
}

interface BuildSuggestedDisplayBlocksInput {
  blocks: ReportCandidateBlockUI[];
  presenceBlocks?: PresenceBlockLite[] | null;
  targets?: TargetLite[] | null;
  staffName?: string | null;
  date?: string | null;
}

function mapReportKindToGanttKind(kind: ReportBlockKind): SuggestedDisplayGanttKind {
  if (kind === 'transport') return 'transport';
  if (kind === 'unknown') return 'unknown';
  if (kind === 'needs_review') return 'review';
  return 'work';
}

export function buildSuggestedDisplayBlocksForAdminGantt(
  input: BuildSuggestedDisplayBlocksInput,
): SuggestedDisplayGanttBlock[] {
  // Time Engine 4.x — backend kan flagga block med hiddenReason
  // (open_day_signal_gap_without_presence, pre_first_gps_signal_gap,
  // short_onsite_anchor_noise). buildReportDisplayBlocks filtrerar redan
  // bort dem, men vi lägger en extra defensiv guard här så att admin-Gantten
  // aldrig kan rendera dem oavsett källa.
  const visibleInput = (input.blocks ?? []).filter((b) => !b.hiddenReason);

  const displayBlocks = buildReportDisplayBlocks({
    blocks: visibleInput,
    presenceBlocks: input.presenceBlocks ?? [],
    targets: input.targets ?? [],
    staffName: input.staffName ?? null,
    date: input.date ?? null,
  });

  return displayBlocks
    .filter((block) => !(block as ReportCandidateBlockUI).hiddenReason)
    .filter((block) => ADMIN_GANTT_VISIBLE_REPORT_KINDS.has(block.kind))
    .map((block) => ({
      ...block,
      ganttKind: mapReportKindToGanttKind(block.kind),
      source: 'reportCandidate' as const,
    }));
}