/**
 * ReportCandidateTimeline
 * ───────────────────────
 * Huvudvy för /staff-management/time-reports.
 *
 * Renderar reportCandidateBlocks från `get-staff-presence-day` (samma motor
 * som report-candidate-blocks-health PASS:ar).
 *
 * Visar ENDAST: work / transport / unknown / needs_review.
 * Visar INTE: rå GPS, presenceDayBlocks, signal_gap som egen huvudrad,
 * time_reports/LTE/travel som separat sanningskälla.
 *
 * Read-only. Skapar inget. Påverkar inget i mobilen.
 */

import React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowRight, Clock, HelpCircle, MapPin, Plane } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type ReportBlockKind = 'work' | 'transport' | 'break' | 'unknown' | 'needs_review';
export type ReportConfidence = 'high' | 'medium' | 'low';
export type ReportReviewState = 'ok' | 'needs_review';

export interface ReportCandidateBlockUI {
  id: string;
  kind: ReportBlockKind;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  durationLabel?: string;
  title: string;
  subtitle?: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  confidence: ReportConfidence;
  reviewState: ReportReviewState;
  reviewReasons?: string[];
  warningLabel?: string | null;
  signalGapMinutes?: number;
}

export interface ReportCandidateSummaryUI {
  reportCandidateBlocksCount: number;
  workBlocksCount: number;
  transportBlocksCount: number;
  unknownBlocksCount: number;
  needsReviewBlocksCount: number;
  workMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
}

const KIND_META: Record<
  ReportBlockKind,
  { Icon: React.ComponentType<{ className?: string }>; bg: string; tone: string; label: string }
> = {
  work:         { Icon: MapPin,        bg: 'bg-primary/5 border-primary/20',                                  tone: 'text-primary',          label: 'Arbete' },
  transport:    { Icon: Plane,         bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200/60',               tone: 'text-blue-600',         label: 'Transport' },
  unknown:      { Icon: HelpCircle,    bg: 'bg-muted/20 border-dashed border-border',                         tone: 'text-muted-foreground', label: 'Okänd plats' },
  needs_review: { Icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300/60',            tone: 'text-amber-700',        label: 'Granska' },
  break:        { Icon: Clock,         bg: 'bg-muted/30 border-border',                                       tone: 'text-muted-foreground', label: 'Rast' },
};

const fmtHm = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return String(iso).slice(11, 16); }
};

const fmtDur = (m: number): string => {
  if (!m || m < 0) return '0m';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

function BlockRow({ block }: { block: ReportCandidateBlockUI }) {
  const meta = KIND_META[block.kind] ?? KIND_META.unknown;
  const { Icon } = meta;
  const subtitle = block.subtitle
    ?? (block.fromLabel && block.toLabel ? `${block.fromLabel} → ${block.toLabel}` : block.targetLabel ?? null);
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${meta.bg}`}>
      <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium truncate">
          <span className="truncate">{block.title}</span>
          {block.reviewState === 'needs_review' && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 border-amber-400 text-amber-700">
              granska
            </Badge>
          )}
          {block.confidence === 'low' && (
            <Badge variant="outline" className="text-[10px] py-0 h-4">låg konfidens</Badge>
          )}
          {block.warningLabel && (
            <span className="text-[10px] text-amber-700" title={block.warningLabel}>
              ⚠ {block.warningLabel}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        )}
        {block.reviewReasons && block.reviewReasons.length > 0 && (
          <div className="text-[10px] text-amber-700/80 truncate">
            {block.reviewReasons.join(' · ')}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap flex items-center gap-1">
        <span>{fmtHm(block.startAt)}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{fmtHm(block.endAt)}</span>
        <span className="ml-2 font-medium text-foreground">
          {block.durationLabel ?? fmtDur(block.durationMinutes)}
        </span>
      </div>
    </div>
  );
}

export interface ReportCandidateTimelineProps {
  blocks: ReportCandidateBlockUI[];
  summary?: ReportCandidateSummaryUI | null;
  loading?: boolean;
}

export const ReportCandidateTimeline: React.FC<ReportCandidateTimelineProps> = ({
  blocks,
  summary,
  loading,
}) => {
  if (loading) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
        Bygger tidrapport…
      </div>
    );
  }
  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
        Inga rapportkandidater för dagen.
      </div>
    );
  }
  // Default-vyn: visa endast work / transport / unknown / needs_review.
  const visibleKinds = new Set<ReportBlockKind>(['work', 'transport', 'unknown', 'needs_review']);
  const visible = blocks.filter((b) => visibleKinds.has(b.kind));
  return (
    <div className="space-y-1.5">
      {visible.map((b) => (
        <BlockRow key={b.id} block={b} />
      ))}
      {summary && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-[11px] text-muted-foreground">
          <span><span className="font-medium text-foreground">{fmtDur(summary.workMinutes)}</span> arbete</span>
          <span><span className="font-medium text-foreground">{fmtDur(summary.transportMinutes)}</span> transport</span>
          {summary.unknownMinutes > 0 && (
            <span><span className="font-medium text-foreground">{fmtDur(summary.unknownMinutes)}</span> okänd</span>
          )}
          {summary.needsReviewMinutes > 0 && (
            <span className="text-amber-700">
              <span className="font-medium">{fmtDur(summary.needsReviewMinutes)}</span> att granska
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportCandidateTimeline;
