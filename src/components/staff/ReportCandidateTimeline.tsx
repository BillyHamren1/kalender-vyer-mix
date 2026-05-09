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

import React, { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Clock, HelpCircle, MapPin, Plane } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';

export type ReportBlockKind = 'work' | 'transport' | 'break' | 'unknown' | 'needs_review';
export type ReportConfidence = 'high' | 'medium' | 'low';
export type ReportReviewState = 'ok' | 'needs_review';

export interface ReportCandidateEvidenceSummaryUI {
  confirmedMinutes?: number;
  probableMinutes?: number;
  signalGapMinutes?: number;
  transportMinutes?: number;
  unknownMinutes?: number;
  presenceBlockCount?: number;
  suppressedSignalGapBlockCount?: number;
  suppressedUnknownBlockCount?: number;
  suppressedZeroLengthBlockCount?: number;
  distanceMeters?: number;
}

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
  // Evidens — fylls från backend ReportCandidateBlock
  evidenceSummary?: ReportCandidateEvidenceSummaryUI | null;
  sourcePresenceBlockIds?: string[];
  hiddenSignalGapIds?: string[];
  hiddenPresenceBlockIds?: string[];
  firstConfirmedAt?: string | null;
  lastConfirmedAt?: string | null;
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
  try { return formatStockholmHm(iso); } catch { return formatStockholmHm(String(iso)); }
};

const fmtDur = (m: number): string => {
  if (!m || m < 0) return '0m';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

function fmtDistance(m?: number): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function EvidencePanel({ block }: { block: ReportCandidateBlockUI }) {
  const ev = block.evidenceSummary ?? {};
  const hasAnySuppressed =
    (ev.suppressedSignalGapBlockCount ?? 0) > 0 ||
    (ev.suppressedUnknownBlockCount ?? 0) > 0 ||
    (ev.suppressedZeroLengthBlockCount ?? 0) > 0;
  const dist = fmtDistance(ev.distanceMeters);
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <div><span className="text-foreground font-medium">Klassificering:</span> {block.kind}</div>
        <div><span className="text-foreground font-medium">Konfidens:</span> {block.confidence}</div>
        <div><span className="text-foreground font-medium">Granskning:</span> {block.reviewState}</div>
        <div><span className="text-foreground font-medium">Start:</span> {formatStockholmHms(block.startAt)}</div>
        <div><span className="text-foreground font-medium">Slut:</span> {formatStockholmHms(block.endAt)}</div>
        <div><span className="text-foreground font-medium">Längd:</span> {block.durationLabel ?? `${block.durationMinutes} min`}</div>
        {block.firstConfirmedAt && (
          <div><span className="text-foreground font-medium">Första bekräftad ping:</span> {formatStockholmHms(block.firstConfirmedAt)}</div>
        )}
        {block.lastConfirmedAt && (
          <div><span className="text-foreground font-medium">Sista bekräftad ping:</span> {formatStockholmHms(block.lastConfirmedAt)}</div>
        )}
        {block.targetType && (
          <div><span className="text-foreground font-medium">Target-typ:</span> {block.targetType}</div>
        )}
        {block.targetId && (
          <div className="truncate" title={block.targetId}><span className="text-foreground font-medium">Target-ID:</span> {block.targetId}</div>
        )}
        {block.targetLabel && (
          <div className="truncate" title={block.targetLabel}><span className="text-foreground font-medium">Target-label:</span> {block.targetLabel}</div>
        )}
        {block.fromLabel && (
          <div className="truncate"><span className="text-foreground font-medium">Från:</span> {block.fromLabel}</div>
        )}
        {block.toLabel && (
          <div className="truncate"><span className="text-foreground font-medium">Till:</span> {block.toLabel}</div>
        )}
        {dist && (
          <div><span className="text-foreground font-medium">Avstånd:</span> {dist}</div>
        )}
      </div>

      <div className="border-t pt-2">
        <div className="text-foreground font-medium mb-1">Evidens (minuter)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
          <div>Bekräftade: <span className="tabular-nums">{ev.confirmedMinutes ?? 0}</span></div>
          <div>Sannolika: <span className="tabular-nums">{ev.probableMinutes ?? 0}</span></div>
          <div>Signalglapp: <span className="tabular-nums">{ev.signalGapMinutes ?? 0}</span></div>
          <div>Transport: <span className="tabular-nums">{ev.transportMinutes ?? 0}</span></div>
          <div>Okänt: <span className="tabular-nums">{ev.unknownMinutes ?? 0}</span></div>
          <div>Närvaro-block: <span className="tabular-nums">{ev.presenceBlockCount ?? 0}</span></div>
        </div>
      </div>

      {hasAnySuppressed && (
        <div className="border-t pt-2">
          <div className="text-foreground font-medium mb-1">Dolt / sammanslaget</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            <div>Signalglapp dolda: <span className="tabular-nums">{ev.suppressedSignalGapBlockCount ?? 0}</span></div>
            <div>Okända dolda: <span className="tabular-nums">{ev.suppressedUnknownBlockCount ?? 0}</span></div>
            <div>Noll-längd dolda: <span className="tabular-nums">{ev.suppressedZeroLengthBlockCount ?? 0}</span></div>
          </div>
        </div>
      )}

      {block.reviewReasons && block.reviewReasons.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-foreground font-medium mb-1">Granska-skäl</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {block.reviewReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {block.sourcePresenceBlockIds && block.sourcePresenceBlockIds.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-foreground font-medium mb-1">Källblock ({block.sourcePresenceBlockIds.length})</div>
          <div className="font-mono text-[10px] break-all leading-snug">
            {block.sourcePresenceBlockIds.join(', ')}
          </div>
        </div>
      )}

      <div className="border-t pt-1 text-[10px]">
        Block-ID: <span className="font-mono">{block.id}</span>
      </div>
    </div>
  );
}

function BlockRow({ block }: { block: ReportCandidateBlockUI & { displayTitle?: string; displaySubtitle?: string | null; locationEvidence?: import('@/lib/staff/buildReportDisplayBlocks').LocationEvidence | null } }) {
  const meta = KIND_META[block.kind] ?? KIND_META.unknown;
  const { Icon } = meta;
  const [open, setOpen] = useState(false);
  const title = block.displayTitle ?? block.title;
  const subtitle = block.displaySubtitle
    ?? block.subtitle
    ?? (block.fromLabel && block.toLabel ? `${block.fromLabel} → ${block.toLabel}` : block.targetLabel ?? null);
  return (
    <div className={`rounded-md border ${meta.bg}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium truncate">
            <span className="truncate">{title}</span>
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
          {open
            ? <ChevronDown className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 ml-1 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <EvidencePanel block={block} />
        </div>
      )}
    </div>
  );
}

import {
  buildReportDisplayBlocks,
  type PresenceBlockLite,
  type TargetLite,
} from '@/lib/staff/buildReportDisplayBlocks';

export interface ReportCandidateTimelineProps {
  blocks: ReportCandidateBlockUI[];
  summary?: ReportCandidateSummaryUI | null;
  loading?: boolean;
  presenceBlocks?: PresenceBlockLite[] | null;
  targets?: TargetLite[] | null;
}

export const ReportCandidateTimeline: React.FC<ReportCandidateTimelineProps> = ({
  blocks,
  summary,
  loading,
  presenceBlocks,
  targets,
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
  // Deterministisk display-överlagring (locationEvidence + Regel 1–4).
  // Rör inte motorns klassificering.
  const display = buildReportDisplayBlocks({
    blocks,
    presenceBlocks: presenceBlocks ?? [],
    targets: targets ?? [],
  });
  // Default-vyn: visa endast work / transport / unknown / needs_review.
  const visibleKinds = new Set<ReportBlockKind>(['work', 'transport', 'unknown', 'needs_review']);
  const visible = display.filter((b) => visibleKinds.has(b.kind));
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
