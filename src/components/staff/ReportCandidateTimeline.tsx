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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StaffMovementMap } from './StaffMovementMap';
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';
import { aiReviewChipLabel, aiReviewChipTooltip, type AiReviewMeta } from '@/lib/staff/aiReview';
import { useAiReviewedBlocks } from '@/hooks/useAiReviewedBlocks';

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

interface EvidenceLookups {
  presenceById: Map<string, import('@/lib/staff/buildReportDisplayBlocks').PresenceBlockLite>;
  targetById: Map<string, import('@/lib/staff/buildReportDisplayBlocks').TargetLite>;
}

function PresenceRow({
  id,
  block,
  variant,
}: {
  id: string;
  block: import('@/lib/staff/buildReportDisplayBlocks').PresenceBlockLite | undefined;
  variant: 'source' | 'hidden_gap' | 'hidden';
}) {
  const tone =
    variant === 'hidden_gap'
      ? 'border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20'
      : variant === 'hidden'
        ? 'border-dashed bg-muted/20'
        : 'bg-background';
  if (!block) {
    return (
      <div className={`rounded border px-2 py-1 text-[10px] ${tone}`}>
        <span className="font-mono">{id}</span>
        <span className="ml-2 text-muted-foreground italic">(presence-block saknas i payload)</span>
      </div>
    );
  }
  const start = block.startAt ?? null;
  const end = block.endAt ?? null;
  return (
    <div className={`rounded border px-2 py-1 text-[10px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {(block.kind || block.status) && (
            <span className="rounded border bg-muted/40 px-1 py-0 text-[9px] uppercase tracking-wide">
              {block.kind ?? block.status}
            </span>
          )}
          <span className="font-mono tabular-nums">
            {start ? formatStockholmHm(start) : '—'} – {end ? formatStockholmHm(end) : '—'}
          </span>
          {block.durationMinutes != null && (
            <span className="text-muted-foreground">({fmtDur(block.durationMinutes)})</span>
          )}
          {block.targetLabel && (
            <span className="truncate text-foreground">· {block.targetLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {block.confidence && (
            <Badge variant="outline" className="h-4 py-0 text-[9px]">{block.confidence}</Badge>
          )}
        </div>
      </div>
      {(block.confirmedMinutes != null || block.signalGapMinutes != null || block.reason || block.source) && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0 text-[9px] text-muted-foreground">
          {block.confirmedMinutes != null && <span>conf: {block.confirmedMinutes}m</span>}
          {block.signalGapMinutes != null && <span>gap: {block.signalGapMinutes}m</span>}
          {block.source && <span>src: {block.source}</span>}
          {block.reason && <span className="truncate">· {block.reason}</span>}
        </div>
      )}
    </div>
  );
}

function TargetCard({
  target,
  block,
}: {
  target: import('@/lib/staff/buildReportDisplayBlocks').TargetLite | undefined;
  block: ReportCandidateBlockUI;
}) {
  if (!target) {
    if (!block.targetLabel && !block.targetId) return null;
    return (
      <div className="rounded border bg-background/60 px-2 py-1.5 text-[10px]">
        <div className="font-medium text-foreground">{block.targetLabel ?? '(okänt target)'}</div>
        {block.targetId && (
          <div className="font-mono text-[9px] text-muted-foreground">id: {block.targetId}</div>
        )}
      </div>
    );
  }
  const isPrimary = target.matchRole === 'primary' || target.canAutoMatchAsWork === true;
  return (
    <div
      className={`rounded border px-2 py-1.5 text-[10px] ${
        isPrimary ? 'border-primary/30 bg-primary/5' : 'bg-background/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-foreground truncate">{target.name}</div>
        <div className="flex items-center gap-1">
          {target.matchRole && (
            <Badge variant="outline" className="h-4 py-0 text-[9px]">{target.matchRole}</Badge>
          )}
          {target.canAutoMatchAsWork === true && (
            <Badge variant="outline" className="h-4 py-0 text-[9px] border-emerald-400 text-emerald-700">
              auto-match
            </Badge>
          )}
        </div>
      </div>
      {target.rawAddress && (
        <div className="text-[9px] text-muted-foreground truncate">{target.rawAddress}</div>
      )}
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-muted-foreground">
        {target.assignmentAnchor && <span>anchor: {target.assignmentAnchor}</span>}
        {target.targetSource && <span>source: {target.targetSource}</span>}
        {target.addressAnchorKey && (
          <span className="truncate">addr: {target.addressAnchorKey}</span>
        )}
      </div>
    </div>
  );
}

function WhyReview({ block }: { block: ReportCandidateBlockUI }) {
  if (block.reviewState !== 'needs_review') return null;
  const reasons = block.reviewReasons ?? [];
  const ev = block.evidenceSummary ?? {};
  const hints: string[] = [];
  if (!block.targetId && !block.targetLabel) hints.push('Inget target kunde matchas.');
  if ((ev.confirmedMinutes ?? 0) === 0) hints.push('Inga bekräftade minuter (alla pings sannolika/saknas).');
  if ((ev.signalGapMinutes ?? 0) > 0) hints.push(`Signalglapp inom blocket: ${ev.signalGapMinutes}m.`);
  if ((ev.presenceBlockCount ?? 0) === 0) hints.push('Inga underliggande närvaro-block.');
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 p-2 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3 w-3" /> Varför behöver granskas?
      </div>
      {reasons.length > 0 && (
        <ul className="ml-4 list-disc">
          {reasons.map((r, i) => <li key={`r-${i}`}>{r}</li>)}
        </ul>
      )}
      {hints.length > 0 && (
        <ul className="ml-4 mt-1 list-disc opacity-80">
          {hints.map((h, i) => <li key={`h-${i}`}>{h}</li>)}
        </ul>
      )}
    </div>
  );
}

function EvidencePanel({
  block,
  lookups,
  staffId,
  staffName,
  date,
}: {
  block: ReportCandidateBlockUI;
  lookups: EvidenceLookups;
  staffId?: string | null;
  staffName?: string | null;
  date?: string | null;
}) {
  const ev = block.evidenceSummary ?? {};
  const hasAnySuppressed =
    (ev.suppressedSignalGapBlockCount ?? 0) > 0 ||
    (ev.suppressedUnknownBlockCount ?? 0) > 0 ||
    (ev.suppressedZeroLengthBlockCount ?? 0) > 0;
  const dist = fmtDistance(ev.distanceMeters);
  const sourceIds = block.sourcePresenceBlockIds ?? [];
  const hiddenGapIds = block.hiddenSignalGapIds ?? [];
  const hiddenIds = block.hiddenPresenceBlockIds ?? [];
  const target = block.targetId ? lookups.targetById.get(block.targetId) : undefined;
  const [mapOpen, setMapOpen] = useState(false);
  const canShowMap = !!staffId && !!date;

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
      {canShowMap && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={(e) => { e.stopPropagation(); setMapOpen(true); }}
          >
            <MapPin className="h-3 w-3" />
            Visa karta för detta block
          </Button>
        </div>
      )}
      {canShowMap && (
        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {staffName ?? 'Personal'} · {date}
                <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                  {formatStockholmHm(block.startAt)} → {formatStockholmHm(block.endAt)}
                  {' · '}
                  {block.durationLabel ?? fmtDur(block.durationMinutes)}
                </span>
              </DialogTitle>
            </DialogHeader>
            <StaffMovementMap
              staffId={staffId as string}
              date={date as string}
              fromIso={block.startAt}
              toIso={block.endAt}
              className="h-[480px]"
            />
          </DialogContent>
        </Dialog>
      )}

      <WhyReview block={block} />

      {/* Target-detalj */}
      <div>
        <div className="mb-1 text-foreground font-medium">Target</div>
        <TargetCard target={target} block={block} />
      </div>

      {/* Källblock — riktiga presence-block, inte bara ID */}
      {sourceIds.length > 0 && (
        <div>
          <div className="mb-1 text-foreground font-medium">
            Källblock ({sourceIds.length})
          </div>
          <div className="space-y-1">
            {sourceIds.map((id) => (
              <PresenceRow
                key={id}
                id={id}
                block={lookups.presenceById.get(id)}
                variant="source"
              />
            ))}
          </div>
        </div>
      )}

      {/* Dolda signalglapp */}
      {hiddenGapIds.length > 0 && (
        <div>
          <div className="mb-1 text-foreground font-medium">
            Dolda signalglapp ({hiddenGapIds.length})
          </div>
          <div className="space-y-1">
            {hiddenGapIds.map((id) => (
              <PresenceRow
                key={id}
                id={id}
                block={lookups.presenceById.get(id)}
                variant="hidden_gap"
              />
            ))}
          </div>
        </div>
      )}

      {/* Övriga dolda block */}
      {hiddenIds.length > 0 && (
        <div>
          <div className="mb-1 text-foreground font-medium">
            Övriga dolda block ({hiddenIds.length})
          </div>
          <div className="space-y-1">
            {hiddenIds.map((id) => (
              <PresenceRow
                key={id}
                id={id}
                block={lookups.presenceById.get(id)}
                variant="hidden"
              />
            ))}
          </div>
        </div>
      )}

      {/* Evidens (siffror) */}
      <div className="border-t pt-2">
        <div className="text-foreground font-medium mb-1">Evidens (minuter)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
          <div>Bekräftade: <span className="tabular-nums">{ev.confirmedMinutes ?? 0}</span></div>
          <div>Sannolika: <span className="tabular-nums">{ev.probableMinutes ?? 0}</span></div>
          <div>Signalglapp: <span className="tabular-nums">{ev.signalGapMinutes ?? 0}</span></div>
          <div>Transport: <span className="tabular-nums">{ev.transportMinutes ?? 0}</span></div>
          <div>Okänt: <span className="tabular-nums">{ev.unknownMinutes ?? 0}</span></div>
          <div>Närvaro-block: <span className="tabular-nums">{ev.presenceBlockCount ?? 0}</span></div>
          {dist && <div>Avstånd: <span className="tabular-nums">{dist}</span></div>}
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

      {/* Tidsdetaljer */}
      <div className="border-t pt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
        <div><span className="text-foreground font-medium">Start:</span> {formatStockholmHms(block.startAt)}</div>
        <div><span className="text-foreground font-medium">Slut:</span> {formatStockholmHms(block.endAt)}</div>
        <div><span className="text-foreground font-medium">Längd:</span> {block.durationLabel ?? `${block.durationMinutes} min`}</div>
        {block.firstConfirmedAt && (
          <div><span className="text-foreground font-medium">Första bekräftad:</span> {formatStockholmHms(block.firstConfirmedAt)}</div>
        )}
        {block.lastConfirmedAt && (
          <div><span className="text-foreground font-medium">Sista bekräftad:</span> {formatStockholmHms(block.lastConfirmedAt)}</div>
        )}
      </div>

      {/* Käll-ID:n längst ner — inte primär information */}
      <details className="border-t pt-1 text-[10px]">
        <summary className="cursor-pointer text-muted-foreground/80">Debug-ID:n</summary>
        <div className="mt-1 space-y-1 font-mono text-[10px] break-all leading-snug">
          <div>block: {block.id}</div>
          {block.targetId && <div>target: {block.targetId}</div>}
          {sourceIds.length > 0 && <div>source: {sourceIds.join(', ')}</div>}
          {hiddenGapIds.length > 0 && <div>hidden_gaps: {hiddenGapIds.join(', ')}</div>}
          {hiddenIds.length > 0 && <div>hidden: {hiddenIds.join(', ')}</div>}
        </div>
      </details>
    </div>
  );
}

function BlockRow({ block, lookups, staffId, staffName, date, resolved, aiReviewMeta }: { block: ReportCandidateBlockUI & { displayTitle?: string; displaySubtitle?: string | null; locationEvidence?: import('@/lib/staff/buildReportDisplayBlocks').LocationEvidence | null; aiReviewContext?: import('@/lib/staff/buildReportDisplayBlocks').AiReviewContext | null; aiHintLabel?: string | null }; lookups: EvidenceLookups; staffId?: string | null; staffName?: string | null; date?: string | null; resolved?: import('@/hooks/useResolvedUnknownStops').ResolvedUnknownStop | null; aiReviewMeta?: import('@/lib/staff/aiReview').AiReviewMeta | null }) {
  const aiChip = aiReviewMeta ? aiReviewChipLabel(aiReviewMeta) : null;
  const aiTooltip = aiReviewMeta ? aiReviewChipTooltip(aiReviewMeta) : null;
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
            {(block.reviewReasons ?? []).includes('inferred_from_neighbors') && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 h-4 border-sky-400 text-sky-700"
                title="Auto-bedömt som arbete eftersom blocket ligger mellan två arbetsblock samma dag"
              >
                auto
              </Badge>
            )}
            {block.warningLabel && (
              <span className="text-[10px] text-amber-700" title={block.warningLabel}>
                ⚠ {block.warningLabel}
              </span>
            )}
            {aiChip && (
              <Badge
                variant="outline"
                className={
                  aiReviewMeta?.status === 'auto_applied'
                    ? 'text-[10px] py-0 h-4 border-emerald-400 text-emerald-700'
                    : 'text-[10px] py-0 h-4 border-amber-400 text-amber-700'
                }
                title={aiTooltip ?? undefined}
              >
                {aiChip}
              </Badge>
            )}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
          )}
          {resolved && (block.kind === 'unknown' || block.kind === 'needs_review') && (
            <div className="mt-1">
              <UnknownStopEnrichment resolved={resolved} compact />
            </div>
          )}
          {block.reviewReasons && block.reviewReasons.length > 0 && (
            <div className="text-[10px] text-amber-700/80 truncate">
              {block.reviewReasons.join(' · ')}
            </div>
          )}
          {aiReviewMeta?.reasoningSummary ? (
            <div
              className="text-[10px] text-muted-foreground/80 italic truncate"
              title={aiReviewMeta.reasoningSummary}
            >
              AI: {aiReviewMeta.reasoningSummary}
            </div>
          ) : block.aiHintLabel ? (
            <div className="text-[10px] text-muted-foreground/80 italic truncate">
              {block.aiHintLabel}
            </div>
          ) : null}
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
          <EvidencePanel block={block} lookups={lookups} staffId={staffId} staffName={staffName} date={date} />
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
import { useResolvedUnknownStops, type UnknownStopRequest } from '@/hooks/useResolvedUnknownStops';
import { UnknownStopEnrichment } from './UnknownStopEnrichment';

export interface ReportCandidateTimelineProps {
  blocks: ReportCandidateBlockUI[];
  summary?: ReportCandidateSummaryUI | null;
  loading?: boolean;
  presenceBlocks?: PresenceBlockLite[] | null;
  targets?: TargetLite[] | null;
  staffId?: string | null;
  staffName?: string | null;
  date?: string | null;
  excludedPreWorkBlocks?: ReportCandidateBlockUI[] | null;
  preWorkExclusionDiagnostics?: {
    excludedPreWorkMinutes?: number;
    excludedPreWorkBlocksCount?: number;
    firstPrimaryWorkAt?: string | null;
    firstPrimaryTargetLabel?: string | null;
  } | null;
}

export const ReportCandidateTimeline: React.FC<ReportCandidateTimelineProps> = ({
  blocks,
  summary,
  loading,
  presenceBlocks,
  targets,
  staffId,
  staffName,
  date,
  excludedPreWorkBlocks,
  preWorkExclusionDiagnostics,
}) => {
  if (loading) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
        Bygger tidrapport…
      </div>
    );
  }
  const preWorkMin = preWorkExclusionDiagnostics?.excludedPreWorkMinutes ?? 0;
  const preWorkCount =
    preWorkExclusionDiagnostics?.excludedPreWorkBlocksCount ??
    (excludedPreWorkBlocks?.length ?? 0);
  const [preWorkOpen, setPreWorkOpen] = useState(false);
  const preWorkInfoRow =
    preWorkCount > 0 && preWorkMin > 0 ? (
      <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setPreWorkOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/20"
          aria-expanded={preWorkOpen}
        >
          {preWorkOpen
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span className="flex-1">
            <span className="font-medium text-foreground">{fmtDur(preWorkMin)}</span>{' '}
            före arbetsdag exkluderat ({preWorkCount} block)
            {preWorkExclusionDiagnostics?.firstPrimaryTargetLabel ? (
              <> — räknas inte som arbetstid (första säkra arbetsplats: {preWorkExclusionDiagnostics.firstPrimaryTargetLabel})</>
            ) : null}
          </span>
        </button>
        {preWorkOpen && excludedPreWorkBlocks && excludedPreWorkBlocks.length > 0 && (
          <div className="border-t border-muted-foreground/20 px-3 py-2 space-y-1">
            {excludedPreWorkBlocks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-[11px]">
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                  {fmtHm(b.startAt)} → {fmtHm(b.endAt)}
                </span>
                <span className="font-medium text-foreground tabular-nums whitespace-nowrap">
                  {b.durationLabel ?? fmtDur(b.durationMinutes)}
                </span>
                <span className="truncate flex-1">
                  {b.title ?? b.targetLabel ?? b.kind}
                </span>
                <Badge variant="outline" className="text-[10px] py-0 h-4">
                  {b.kind}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;
  if (!blocks || blocks.length === 0) {
    return (
      <div className="space-y-1.5">
        {preWorkInfoRow}
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
          Inga rapportkandidater för dagen.
        </div>
      </div>
    );
  }
  // Deterministisk display-överlagring (locationEvidence + Regel 1–4).
  // Rör inte motorns klassificering.
  const display = buildReportDisplayBlocks({
    blocks,
    presenceBlocks: presenceBlocks ?? [],
    targets: targets ?? [],
    staffName: staffName ?? null,
    date: date ?? null,
  });
  // Default-vyn: visa endast work / transport / unknown / needs_review.
  const visibleKinds = new Set<ReportBlockKind>(['work', 'transport', 'unknown', 'needs_review']);
  const visible = display.filter((b) => visibleKinds.has(b.kind));
  // Lookups så EvidencePanel kan rendera faktiska källblock + target istället för ID-listor.
  const lookups: EvidenceLookups = {
    presenceById: new Map((presenceBlocks ?? []).map((p) => [p.id, p])),
    targetById: new Map((targets ?? []).map((t) => [t.id, t])),
  };

  // ── Resolve unknown stops (read-only edge function) ───────────────
  // Bygg en lookup-request för varje osäker rad med koordinater.
  const resolveReqs: UnknownStopRequest[] = staffId
    ? visible
        .filter((b) => (b.kind === 'unknown' || b.kind === 'needs_review')
          && b.locationEvidence?.lat != null
          && b.locationEvidence?.lng != null)
        .map((b) => ({
          key: b.id,
          staffId,
          lat: b.locationEvidence!.lat as number,
          lng: b.locationEvidence!.lng as number,
          atIso: b.startAt,
          radiusMeters: 250,
        }))
    : [];
  const resolvedMap = useResolvedUnknownStops(resolveReqs);

  // Overlay AI-review-meta från staff_day_report_cache (realtime).
  const aiReview = useAiReviewedBlocks(staffId ?? null, date ?? null);

  return (
    <div className="space-y-1.5">
      {preWorkInfoRow}
      {aiReview.pending && (
        <div className="rounded-md border border-dashed border-sky-300 bg-sky-50 px-3 py-1 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
          AI granskar oklara block i bakgrunden…
        </div>
      )}
      {visible.map((b) => (
        <BlockRow
          key={b.id}
          block={b}
          lookups={lookups}
          staffId={staffId}
          staffName={staffName}
          date={date}
          resolved={resolvedMap.get(b.id) ?? null}
          aiReviewMeta={aiReview.byId.get(b.id) ?? null}
        />
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
