/**
 * MobileDayReportPreview — defaultvyn för en dag i /m/report.
 *
 * Princip:
 *   - Ren "granska och skicka in"-vy
 *   - Renderar bara data.segments / data.totals / data.map / data.submission
 *   - Ingen egen GPS-tolkning, inga inputfält
 *   - Editorn (ManualWorkSegmentsEditor) öppnas bara om användaren trycker "Redigera"
 *
 * Queue-mode (Granska alla): visar "Dag X av Y" + "Hoppa över"-knapp.
 * Föräldern (MobileTimeReportQueue) ansvarar för auto-next efter submit/skip.
 */
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, Loader2, Info, MapPin, Clock, Pencil, CheckCircle2,
  ChevronDown, ChevronUp, SkipForward,
} from 'lucide-react';
import MobileGpsDayMap from './MobileGpsDayMap';
import {
  buildManualDayFromSuggested,
  isoToHHmm,
  fmtDuration,
  targetFromMatched,
} from './suggestionPayload';
import type {
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
  ManualDayPayload,
} from './types';

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

export interface QueuePosition {
  index: number; // 0-baserad
  total: number;
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
  /** Om satt körs vyn i "Granska alla"-läge med X-av-Y och Hoppa över. */
  queuePosition?: QueuePosition | null;
  onSkip?: () => void;
}

const MobileDayReportPreview: React.FC<Props> = ({
  data,
  status,
  visual,
  userComment,
  onUserCommentChange,
  onSubmit,
  onEdit,
  isSubmitting,
  queuePosition,
  onSkip,
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

  // Mjuka, granska-vänliga varningar (ingen omräkning, ingen blockering av submit)
  const warnings: string[] = [];
  if (totalMin > 14 * 60) warnings.push(`Föreslagen tid är ${fmtDuration(totalMin)}.`);
  if (validBlocks.some((b) => b.durationMinutes > 12 * 60)) warnings.push('Ett block är ovanligt långt.');
  if (firstStart === '02:00') warnings.push('Dagen startar tidigt enligt GPS-underlaget.');
  if (validBlocks.some((b) => !targetFromMatched(b))) warnings.push('Något block saknar tydlig plats/projekt.');

  const hasWarnings = warnings.length > 0;
  const [showWarningDetails, setShowWarningDetails] = useState(false);

  const handleDirectSubmit = () => {
    const payload = buildManualDayFromSuggested(data, userComment);
    if (!payload) return;
    void onSubmit(payload);
  };

  const inQueue = !!queuePosition && queuePosition.total > 1;

  return (
    <div className="space-y-3">
      {/* Statusrad + ev. Dag X av Y */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge variant={visual.variant} className="gap-1.5 px-2.5 py-1 text-xs">
          {visual.label}
        </Badge>
        {inQueue && (
          <Badge variant="outline" className="text-xs gap-1.5 px-2.5 py-1">
            Dag {queuePosition!.index + 1} av {queuePosition!.total}
          </Badge>
        )}
      </div>

      {/* Dagförslag */}
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

      {/* Mjuk granska-varning */}
      {hasWarnings && !isLocked && (
        <Card className="p-3 border border-amber-200/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/10 shadow-none">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-amber-700/80 dark:text-amber-300/80 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">Kontrollera förslaget</p>
              <p className="text-xs text-muted-foreground">
                Dagen verkar längre än vanligt. Granska tiderna innan du skickar in. Justera vid behov med Redigera.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowWarningDetails((v) => !v)}
                  aria-expanded={showWarningDetails}
                >
                  {showWarningDetails ? (
                    <>Dölj detaljer <ChevronUp className="h-3 w-3 ml-1" /></>
                  ) : (
                    <>Visa detaljer <ChevronDown className="h-3 w-3 ml-1" /></>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={onEdit}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Redigera tider
                </Button>
              </div>
              {showWarningDetails && (
                <ul className="text-xs text-muted-foreground space-y-0.5 pt-1 pl-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground/60">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {droppedZero > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {droppedZero} felaktigt 0-minutersblock togs bort från förslaget.
        </p>
      )}

      {/* Karta */}
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

      {/* Tidslinje */}
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

      {/* Kommentar */}
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

      {/* Actions */}
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
            {inQueue ? 'Skicka in & nästa' : 'Skicka in tidrapport'}
          </Button>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onEdit}
            disabled={isSubmitting || isLocked}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Redigera
          </Button>
          {inQueue && onSkip && (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={onSkip}
              disabled={isSubmitting}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Hoppa över
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileDayReportPreview;
