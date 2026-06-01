/**
 * UnifiedDayReportView — EN sida för hela tidrapporteringen.
 *
 * Princip:
 *  - Inget separat "Redigera"-läge.
 *  - GPS-förslaget visas som riktiga tidsblock (start/slut/plats),
 *    direkt redigerbara på samma sida.
 *  - "Arbetstid" (start/slut/rast) ligger överst, alltid synlig.
 *  - "Lägg till projekt/plats" finns alltid under tidslinjen.
 *  - En enda kommentar för dagen.
 *  - Summering + mjuk varning längst ned.
 *  - En primär "Skicka in"-knapp.
 *
 *  Skriver bara via submit-mobile-gps-day-v2 (manualDay-payload) — rör
 *  aldrig time_reports/workdays/location_time_entries/travel_time_logs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Loader2, Plus, Send, Trash2,
} from 'lucide-react';
import ManualWorkTargetPicker from './ManualWorkTargetPicker';
import { fmtDuration, isoToHHmm, targetFromMatched } from './suggestionPayload';
import type {
  ManualDayPayload,
  ManualWorkSegmentInput,
  ManualWorkTarget,
  ManualWorkTargets,
  MobileGpsDaySegment,
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
} from './types';

interface Props {
  date: string;
  data: MobileGpsDayView;
  status: MobileGpsSubmissionStatus;
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmit: (input: ManualDayPayload) => void | Promise<void>;
  isSubmitting: boolean;
}

interface BlockDraft {
  id: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  target: ManualWorkTarget | null;
  comment: string;
  sourceSegmentId: string | null;
}

const HHMM_RE = /^\d{2}:\d{2}$/;

function diffMinutes(start: string, end: string): number {
  if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function newId() { return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function blocksFromSuggested(suggested: MobileGpsDaySegment[]): BlockDraft[] {
  const stays = suggested.filter((s) => s.kind === 'stay' && s.durationMinutes > 0);
  return stays.map((s) => ({
    id: s.segmentKey,
    startTime: isoToHHmm(s.currentStartTime) ?? '08:00',
    endTime: isoToHHmm(s.currentEndTime) ?? '16:00',
    target: targetFromMatched(s),
    comment: '',
    sourceSegmentId: s.segmentKey,
  }));
}

const UnifiedDayReportView: React.FC<Props> = ({
  data, status, userComment, onUserCommentChange, onSubmit, isSubmitting,
}) => {
  const isLocked = status === 'approved' || status === 'payroll_approved';

  // Initial state byggs från GPS-förslaget en gång per dag/snapshot.
  const initial = useMemo(() => {
    const blocks = blocksFromSuggested(data.segments ?? []);
    const dayStart = blocks[0]?.startTime ?? '';
    const dayEnd = blocks[blocks.length - 1]?.endTime ?? '';
    return { dayStart, dayEnd, blocks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sourceSnapshotId, data.date]);

  const [dayStartTime, setDayStartTime] = useState<string>(initial.dayStart);
  const [dayEndTime, setDayEndTime] = useState<string>(initial.dayEnd);
  const [breakStr, setBreakStr] = useState<string>('30');
  const [blocks, setBlocks] = useState<BlockDraft[]>(initial.blocks);
  const [deletedSourceIds, setDeletedSourceIds] = useState<string[]>([]);
  const [pickerForId, setPickerForId] = useState<string | null>(null);

  useEffect(() => {
    setDayStartTime(initial.dayStart);
    setDayEndTime(initial.dayEnd);
    setBlocks(initial.blocks);
    setDeletedSourceIds([]);
    setBreakStr('30');
  }, [initial]);

  const dayBreak = Math.max(0, Math.round(Number(breakStr) || 0));
  const dayGross = dayStartTime && dayEndTime ? diffMinutes(dayStartTime, dayEndTime) : 0;
  const dayNet = Math.max(0, dayGross - dayBreak);

  const reported = useMemo(
    () => blocks.reduce((sum, b) => sum + diffMinutes(b.startTime, b.endTime), 0),
    [blocks],
  );

  const diff = reported - dayNet;
  const overReported = dayNet > 0 && diff > 12;

  const missingTarget = blocks.some((b) => diffMinutes(b.startTime, b.endTime) > 0 && !b.target);
  const hasBlocks = blocks.length > 0;
  const canSubmit =
    !isLocked &&
    !isSubmitting &&
    HHMM_RE.test(dayStartTime) &&
    HHMM_RE.test(dayEndTime) &&
    dayGross > 0 &&
    hasBlocks &&
    !missingTarget;

  // ---------- mutators
  const updateBlock = (id: string, patch: Partial<BlockDraft>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeBlock = (b: BlockDraft) => {
    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
    if (b.sourceSegmentId) {
      setDeletedSourceIds((ids) =>
        ids.includes(b.sourceSegmentId!) ? ids : [...ids, b.sourceSegmentId!],
      );
    }
  };

  const addBlock = () => {
    const lastEnd = blocks[blocks.length - 1]?.endTime ?? dayStartTime ?? '08:00';
    const start = HHMM_RE.test(lastEnd) ? lastEnd : '08:00';
    const end = dayEndTime && HHMM_RE.test(dayEndTime) ? dayEndTime : start;
    setBlocks((bs) => [
      ...bs,
      { id: newId(), startTime: start, endTime: end, target: null, comment: '', sourceSegmentId: null },
    ]);
  };

  const handleSubmit = () => {
    const segments: ManualWorkSegmentInput[] = blocks
      .filter((b) => diffMinutes(b.startTime, b.endTime) > 0)
      .map((b) => ({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        target: b.target,
        comment: b.comment.trim() || null,
        sourceSegmentId: b.sourceSegmentId,
      }));

    const start = dayStartTime || segments[0]?.startTime || '08:00';
    const end = dayEndTime || segments[segments.length - 1]?.endTime || start;

    void onSubmit({
      dayStartTime: start,
      dayEndTime: end,
      breakMinutes: dayBreak,
      segments,
      deletedSegmentIds: deletedSourceIds,
      comment: userComment.trim() || null,
    });
  };

  const pickerBlock = pickerForId ? blocks.find((b) => b.id === pickerForId) ?? null : null;
  const pickerTargets: ManualWorkTargets = data.manualTargets ?? {
    assignedTargets: [], locationTargets: [], searchableTargets: [],
  };

  // ---------- render
  return (
    <div className="space-y-3">
      {/* 1) Arbetstid */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Arbetstid</h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {dayGross > 0 ? fmtDuration(dayNet) : '—'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Start</Label>
            <Input
              type="time"
              value={dayStartTime}
              onChange={(e) => setDayStartTime(e.target.value)}
              disabled={isLocked || isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Slut</Label>
            <Input
              type="time"
              value={dayEndTime}
              onChange={(e) => setDayEndTime(e.target.value)}
              disabled={isLocked || isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Rast (min)</Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={breakStr}
              onChange={(e) => setBreakStr(e.target.value)}
              disabled={isLocked || isSubmitting}
            />
          </div>
        </div>
      </Card>

      {/* 2) Tidslinje */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tidslinje
          </h3>
          {blocks.some((b) => b.sourceSegmentId) && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              GPS-förslag
            </Badge>
          )}
        </div>

        {blocks.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Inget GPS-förslag idag. Lägg till projekt eller plats nedan.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {blocks.map((b) => {
            const mins = diffMinutes(b.startTime, b.endTime);
            const targetMissing = !b.target;
            const isOther = b.target?.targetType === 'other';
            return (
              <div
                key={b.id}
                className="rounded-lg border bg-card p-3 space-y-2.5"
              >
                {/* Plats/projekt */}
                <button
                  onClick={() => setPickerForId(b.id)}
                  disabled={isLocked || isSubmitting}
                  className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-md border transition ${
                    targetMissing
                      ? 'border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10'
                      : 'border-border bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOther && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    <div className="min-w-0">
                      {targetMissing ? (
                        <div className="text-sm font-medium text-primary">Välj projekt / plats</div>
                      ) : (
                        <>
                          <div className="text-sm font-medium truncate">{b.target!.label}</div>
                          {b.target!.subtitle && (
                            <div className="text-[11px] text-muted-foreground truncate">{b.target!.subtitle}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                {/* Tider */}
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Start</Label>
                    <Input
                      type="time"
                      value={b.startTime}
                      onChange={(e) => updateBlock(b.id, { startTime: e.target.value })}
                      disabled={isLocked || isSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Slut</Label>
                    <Input
                      type="time"
                      value={b.endTime}
                      onChange={(e) => updateBlock(b.id, { endTime: e.target.value })}
                      disabled={isLocked || isSubmitting}
                    />
                  </div>
                  <div className="pb-1.5 text-xs text-muted-foreground tabular-nums">
                    {fmtDuration(mins)}
                  </div>
                </div>

                {/* Kommentar */}
                <Textarea
                  value={b.comment}
                  onChange={(e) => updateBlock(b.id, { comment: e.target.value })}
                  placeholder="Kommentar (valfritt)"
                  rows={1}
                  disabled={isLocked || isSubmitting}
                  className="resize-none text-sm"
                />

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive h-7"
                    onClick={() => removeBlock(b)}
                    disabled={isLocked || isSubmitting}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Ta bort
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Lägg till — alltid synlig */}
        <Button
          variant="outline"
          className="w-full"
          onClick={addBlock}
          disabled={isLocked || isSubmitting}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Lägg till projekt / plats
        </Button>
      </Card>

      {/* 3) Kommentar */}
      <Card className="p-3 space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Kommentar till admin
        </Label>
        <Textarea
          value={userComment}
          onChange={(e) => onUserCommentChange(e.target.value)}
          placeholder="Frivilligt – t.ex. övertid, problem, korrigeringar eller övrig information."
          rows={2}
          disabled={isLocked || isSubmitting}
          className="resize-none"
        />
      </Card>

      {/* 4) Summering */}
      <Card className="p-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Arbetstid</span>
          <span className="tabular-nums">{fmtDuration(dayGross)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Rast</span>
          <span className="tabular-nums">{dayBreak} min</span>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold border-t pt-1.5">
          <span>Total rapporterad tid</span>
          <span className="tabular-nums">{fmtDuration(reported)}</span>
        </div>
        {overReported && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900">
              Rapporterad tid överstiger arbetstiden med {fmtDuration(diff)}.
            </p>
          </div>
        )}
        {missingTarget && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900">
              Något block saknar projekt eller plats.
            </p>
          </div>
        )}
      </Card>

      {/* 5) Skicka in */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 bg-gradient-to-t from-background via-background to-background/80">
        {isLocked ? (
          <Card className="p-3 flex items-center gap-2 bg-primary/5 border-primary/30">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Godkänd</span>
          </Card>
        ) : (
          <Button
            className="w-full h-12 text-base"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Send className="h-4 w-4 mr-2" />}
            Skicka in tidrapport
          </Button>
        )}
      </div>

      {/* Picker */}
      <ManualWorkTargetPicker
        open={!!pickerBlock}
        onOpenChange={(open) => { if (!open) setPickerForId(null); }}
        targets={pickerTargets}
        currentTarget={pickerBlock?.target ?? null}
        onSelect={(t) => {
          if (pickerForId) updateBlock(pickerForId, { target: t });
        }}
      />
    </div>
  );
};

export default UnifiedDayReportView;
