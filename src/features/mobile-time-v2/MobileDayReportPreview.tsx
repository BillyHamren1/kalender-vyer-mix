/**
 * MobileDayReportPreview — defaultvyn för en dag i /m/report.
 *
 * Princip:
 *   - Ren "granska och skicka in"-vy
 *   - Renderar bara data.segments / data.totals / data.map / data.submission
 *   - Ingen egen GPS-tolkning, inga inputfält
 *   - Editorn (ManualWorkSegmentsEditor) öppnas bara om användaren trycker "Redigera"
 */
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, Loader2, Info, MapPin, Clock, Pencil, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import MobileGpsDayMap from './MobileGpsDayMap';
import type {
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
  ManualDayPayload,
  ManualWorkSegmentInput,
  ManualWorkTarget,
  MobileGpsDaySegment,
} from './types';

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

interface Props {
  date: string;
  data: MobileGpsDayView;
  status: MobileGpsSubmissionStatus;
  visual: StatusVisual;
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmit: (input: ManualDayPayload) => void | Promise<void>;
  onEdit: () => void;
  isSubmitting: boolean;
}

// ---- helpers (rendering only, ingen GPS-omtolkning) -----------------------

function isoToHHmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function targetFromMatched(seg: MobileGpsDaySegment): ManualWorkTarget | null {
  const m = seg.matched;
  if (!m || !m.kind || !m.id) return null;
  if (m.kind === 'home') return null;
  const label = m.name ?? seg.label ?? 'Förslag';
  switch (m.kind) {
    case 'project':       return { targetType: 'project',       targetId: m.id, label, subtitle: null, project_id: m.id };
    case 'large_project': return { targetType: 'large_project', targetId: m.id, label, subtitle: null, large_project_id: m.id };
    case 'location':      return { targetType: 'location',      targetId: m.id, label, subtitle: null, location_id: m.id };
    case 'booking':       return { targetType: 'booking',       targetId: m.id, label, subtitle: null, booking_id: m.id };
    default:              return null;
  }
}

/** Bygg ManualDayPayload från suggested segments — utan att räkna om GPS. */
function buildManualDayFromSuggested(
  data: MobileGpsDayView,
  comment: string,
): ManualDayPayload | null {
  const work = (data.segments ?? []).filter(
    (s) => s.kind === 'stay' && s.durationMinutes > 0,
  );
  if (work.length === 0) return null;
  const first = work[0];
  const last = work[work.length - 1];
  const dayStart = isoToHHmm(first.currentStartTime) ?? '08:00';
  const dayEnd = isoToHHmm(last.currentEndTime) ?? '16:00';

  const segments: ManualWorkSegmentInput[] = work.map((s) => ({
    id: s.segmentKey,
    startTime: isoToHHmm(s.currentStartTime) ?? '08:00',
    endTime: isoToHHmm(s.currentEndTime) ?? '16:00',
    target: targetFromMatched(s),
    comment: null,
    sourceSegmentId: s.segmentKey,
  }));

  return {
    dayStartTime: dayStart,
    dayEndTime: dayEnd,
    breakMinutes: 0,
    segments,
    deletedSegmentIds: [],
    comment: comment.trim() || null,
  };
}

// ---- component ------------------------------------------------------------

const MobileDayReportPreview: React.FC<Props> = ({
  data,
  status,
  visual,
  userComment,
  onUserCommentChange,
  onSubmit,
  onEdit,
  isSubmitting,
}) => {
  const isLocked = status === 'approved' || status === 'payroll_approved';
  const canSubmit = data.submission?.canSubmit !== false && !isLocked;

  const workSegments = useMemo(
    () => (data.segments ?? []).filter((s) => s.kind === 'stay'),
    [data.segments],
  );
  const validBlocks = workSegments.filter((s) => s.durationMinutes > 0);
  const droppedZero = workSegments.length - validBlocks.length;

  const totalMin = data.totals?.workMinutes ?? validBlocks.reduce((a, b) => a + b.durationMinutes, 0);
  const firstStart = validBlocks[0] ? isoToHHmm(validBlocks[0].currentStartTime) : null;
  const lastEnd = validBlocks.length ? isoToHHmm(validBlocks[validBlocks.length - 1].currentEndTime) : null;

  // Heuristiska varningar (bara presentation, ingen omräkning)
  const warnings: string[] = [];
  if (totalMin > 14 * 60) warnings.push(`Förslaget visar ${fmtDuration(totalMin)} — kontrollera innan du skickar in.`);
  if (validBlocks.some((b) => b.durationMinutes > 12 * 60)) warnings.push('Ett block är längre än 12 timmar.');
  if (firstStart === '02:00') warnings.push('Dagstart 02:00 är ovanligt — kontrollera GPS-underlaget.');
  if (validBlocks.some((b) => !targetFromMatched(b))) warnings.push('Något block saknar tydlig plats/projekt.');

  const hasWarnings = warnings.length > 0;

  const handleDirectSubmit = () => {
    const payload = buildManualDayFromSuggested(data, userComment);
    if (!payload) return;
    void onSubmit(payload);
  };

  return (
    <div className="space-y-3">
      {/* A. Statusrad */}
      <div className="flex items-center justify-between">
        <Badge variant={visual.variant} className="gap-1.5 px-2.5 py-1 text-xs">
          {visual.label}
        </Badge>
      </div>

      {/* B. Dagförslag */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <Clock className="h-3.5 w-3.5" />
          Dagförslag
        </div>
        <div className="text-3xl font-semibold tracking-tight">{fmtDuration(totalMin)}</div>
        {firstStart && lastEnd && (
          <div className="text-sm text-muted-foreground">
            {firstStart}–{lastEnd}
            {validBlocks.length > 1 && ` · ${validBlocks.length} block`}
          </div>
        )}
        {validBlocks.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Inget GPS-förslag idag. Tryck Redigera för att fylla i manuellt.
          </div>
        )}
      </Card>

      {/* Varningar */}
      {hasWarnings && (
        <Card className="p-3 border-orange-400/50 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Förslaget ser ovanligt ut – kontrollera innan du skickar in.
              </p>
              <ul className="text-xs text-orange-800 dark:text-orange-300 space-y-0.5 list-disc list-inside">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {droppedZero > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {droppedZero} felaktigt 0-minutersblock togs bort från förslaget.
        </p>
      )}

      {/* C. Karta / GPS-underlag */}
      {data.map?.hasPings ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide px-1">
            <MapPin className="h-3.5 w-3.5" />
            Dagens rörelser
          </div>
          <MobileGpsDayMap map={data.map} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">GPS-underlag saknas</p>
      )}

      {/* D. Tidslinje / block (read-only) */}
      {validBlocks.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Tidslinje</div>
          <div className="space-y-2">
            {validBlocks.map((s) => {
              const start = isoToHHmm(s.currentStartTime);
              const end = isoToHHmm(s.currentEndTime);
              const label = s.matched?.name ?? s.label ?? 'Okänd plats';
              return (
                <div key={s.segmentKey} className="flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {start}–{end} · {fmtDuration(s.durationMinutes)}
                    </p>
                  </div>
                  {s.matched?.kind && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0 mt-0.5">
                      GPS
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* E. Kommentar */}
      {!isLocked && (
        <Card className="p-3 space-y-1.5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Kommentar till admin</div>
          <Textarea
            value={userComment}
            onChange={(e) => onUserCommentChange(e.target.value)}
            placeholder="Frivilligt – t.ex. övertid, problem, etc."
            rows={2}
            disabled={isSubmitting}
            className="resize-none"
          />
        </Card>
      )}

      {/* F. Actions — sticky */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 bg-gradient-to-t from-background via-background to-background/80 space-y-2">
        {isLocked ? (
          <Card className="p-3 flex items-center gap-2 bg-primary/5 border-primary/30">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Godkänd</span>
          </Card>
        ) : (
          <Button
            className="w-full h-12 text-base"
            onClick={handleDirectSubmit}
            disabled={!canSubmit || isSubmitting || validBlocks.length === 0}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Skicka in tidrapport
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={onEdit}
          disabled={isSubmitting || isLocked}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Redigera
        </Button>
      </div>
    </div>
  );
};

export default MobileDayReportPreview;
