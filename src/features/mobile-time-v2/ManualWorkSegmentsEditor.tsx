/**
 * ManualWorkSegmentsEditor — den unified dagvyn för /m/report.
 *
 * Modell:
 *   1) Hela dagen: dayStartTime / dayEndTime / breakMinutes
 *   2) Fördelning: ett eller flera "projekt" med VARAKTIGHET (h + min)
 *      — start/slut härleds vid submit genom att kedja dagens block från
 *      dayStartTime. Användaren behöver alltså inte mecka med tider per block.
 *   3) Skicka in
 *
 * Block kan vara manuella eller komma från ett GPS-/Time Engine-förslag
 * (då har de sourceSegmentId). Användaren kan ta bort vilket som helst med
 * papperskorgen — borttagna sourceSegmentId rapporteras som deletedSegmentIds
 * i submit-payload så admin ser att förslag avvisats.
 *
 * Systemet auto-kopplar aldrig manuell tid. Target väljs alltid av användaren.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Send, Loader2, ChevronRight, AlertTriangle, CalendarClock,
} from 'lucide-react';
import ManualWorkTargetPicker from './ManualWorkTargetPicker';
import type {
  ManualWorkSegmentInput,
  ManualWorkTarget,
  ManualWorkTargets,
  ManualDayPayload,
  MobileGpsDaySegment,
} from './types';

interface Props {
  date: string;
  targets: ManualWorkTargets;
  /** Förslagna block från GPS / Time Engine. Tomt = ren manuell dag. */
  suggestedSegments?: MobileGpsDaySegment[];
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmit: (input: ManualDayPayload) => void | Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

interface BlockDraft {
  id: string;
  /** Varaktighet i minuter. */
  durationMin: number;
  target: ManualWorkTarget | null;
  comment: string;
  sourceSegmentId: string | null;
}

// ----- helpers --------------------------------------------------------------

const HHMM_RE = /^\d{2}:\d{2}$/;

function diffMinutes(start: string, end: string): number {
  if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function addMinutesHHmm(start: string, minutes: number): string {
  if (!HHMM_RE.test(start)) return start;
  const [sh, sm] = start.split(':').map(Number);
  const total = (sh * 60 + sm + Math.max(0, Math.round(minutes))) % (24 * 60);
  const h = Math.floor(total / 60).toString().padStart(2, '0');
  const m = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function newId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isoToStockholmHHmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
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

/** Bygg initiala block + dagstider från GPS-förslag. */
function buildInitialFromSuggested(suggested: MobileGpsDaySegment[]): {
  dayStartTime: string;
  dayEndTime: string;
  blocks: BlockDraft[];
} {
  const workish = suggested.filter((s) => s.kind === 'stay');
  if (workish.length === 0) {
    return { dayStartTime: '08:00', dayEndTime: '16:00', blocks: [] };
  }
  const first = workish[0];
  const last = workish[workish.length - 1];
  const dayStart = isoToStockholmHHmm(first.currentStartTime) ?? '08:00';
  const dayEnd = isoToStockholmHHmm(last.currentEndTime) ?? '16:00';
  const blocks: BlockDraft[] = workish.map((s) => {
    const start = isoToStockholmHHmm(s.currentStartTime) ?? '08:00';
    const end = isoToStockholmHHmm(s.currentEndTime) ?? start;
    return {
      id: s.segmentKey,
      durationMin: diffMinutes(start, end),
      target: targetFromMatched(s),
      comment: '',
      sourceSegmentId: s.segmentKey,
    };
  });
  return { dayStartTime: dayStart, dayEndTime: dayEnd, blocks };
}

// ----- component ------------------------------------------------------------

const ManualWorkSegmentsEditor: React.FC<Props> = ({
  date,
  targets,
  suggestedSegments,
  userComment,
  onUserCommentChange,
  onSubmit,
  isSubmitting,
  disabled,
  disabledReason,
}) => {
  // Initial state — bygg från GPS-förslag om de finns, annars ren dag.
  const initial = useMemo(() => {
    if (suggestedSegments && suggestedSegments.length > 0) {
      return buildInitialFromSuggested(suggestedSegments);
    }
    return { dayStartTime: '08:00', dayEndTime: '16:00', blocks: [] as BlockDraft[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const [dayStartTime, setDayStartTime] = useState<string>(initial.dayStartTime);
  const [dayEndTime, setDayEndTime] = useState<string>(initial.dayEndTime);
  const [breakStr, setBreakStr] = useState<string>('30');
  const [blocks, setBlocks] = useState<BlockDraft[]>(initial.blocks);
  const [deletedSourceIds, setDeletedSourceIds] = useState<string[]>([]);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlockDraft | null>(null);

  // Reset när datum/förslag ändras
  useEffect(() => {
    setDayStartTime(initial.dayStartTime);
    setDayEndTime(initial.dayEndTime);
    setBlocks(initial.blocks);
    setDeletedSourceIds([]);
    setBreakStr('30');
  }, [initial]);

  const dayBreak = Math.max(0, Math.round(Number(breakStr) || 0));
  const dayGross = diffMinutes(dayStartTime, dayEndTime);
  const dayNet = Math.max(0, dayGross - dayBreak);

  const allocated = useMemo(
    () => blocks.reduce((sum, b) => sum + Math.max(0, b.durationMin), 0),
    [blocks],
  );

  const remaining = dayNet - allocated;
  const matchesDay = Math.abs(remaining) <= 5; // tolerans 5 min

  const zeroBlocks = blocks.filter((b) => b.durationMin <= 0);
  const missingTargetBlocks = blocks.filter((b) => b.durationMin > 0 && !b.target);

  const canSubmit =
    !disabled &&
    !isSubmitting &&
    HHMM_RE.test(dayStartTime) &&
    HHMM_RE.test(dayEndTime) &&
    dayGross > 0 &&
    dayBreak < dayGross &&
    blocks.length > 0 &&
    zeroBlocks.length === 0 &&
    missingTargetBlocks.length === 0 &&
    allocated > 0 &&
    matchesDay;

  // ----- mutators
  const updateBlock = (id: string, patch: Partial<BlockDraft>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const updateDuration = (id: string, hours: number, minutes: number) => {
    const total = Math.max(0, Math.round(hours * 60 + minutes));
    updateBlock(id, { durationMin: total });
  };

  const removeBlockImmediate = (b: BlockDraft) => {
    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
    if (b.sourceSegmentId) {
      setDeletedSourceIds((ids) =>
        ids.includes(b.sourceSegmentId!) ? ids : [...ids, b.sourceSegmentId!],
      );
    }
  };

  const requestRemove = (b: BlockDraft) => {
    if (b.durationMin <= 0) {
      removeBlockImmediate(b);
      return;
    }
    setConfirmDelete(b);
  };

  const addBlock = () => {
    const rem = Math.max(0, dayNet - allocated);
    setBlocks((bs) => [
      ...bs,
      { id: newId(), durationMin: rem, target: null, comment: '', sourceSegmentId: null },
    ]);
  };

  const fillFromWholeDay = () => {
    setBlocks([
      { id: newId(), durationMin: dayNet, target: null, comment: '', sourceSegmentId: null },
    ]);
  };

  const handleSubmit = () => {
    // Kedja blocken sekventiellt från dayStartTime → derivera start/slut per block.
    let cursor = dayStartTime;
    const segments: ManualWorkSegmentInput[] = [];
    for (const b of blocks) {
      if (b.durationMin <= 0) continue;
      const startTime = cursor;
      const endTime = addMinutesHHmm(cursor, b.durationMin);
      segments.push({
        id: b.id,
        startTime,
        endTime,
        target: b.target,
        comment: b.comment.trim() || null,
        sourceSegmentId: b.sourceSegmentId,
      });
      cursor = endTime;
    }
    void onSubmit({
      dayStartTime,
      dayEndTime,
      breakMinutes: dayBreak,
      segments,
      deletedSegmentIds: deletedSourceIds,
      comment: userComment.trim() || null,
    });
  };

  const pickerActive = pickerId ? blocks.find((b) => b.id === pickerId) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Kort 1: Hela dagen */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Hela dagen</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Start</Label>
            <Input
              type="time"
              value={dayStartTime}
              onChange={(e) => setDayStartTime(e.target.value)}
              disabled={disabled || isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Slut</Label>
            <Input
              type="time"
              value={dayEndTime}
              onChange={(e) => setDayEndTime(e.target.value)}
              disabled={disabled || isSubmitting}
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
              disabled={disabled || isSubmitting}
            />
          </div>
        </div>
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
          <span className="text-muted-foreground">Dagens tid (efter rast)</span>
          <span className="font-semibold">{fmtDuration(dayNet)}</span>
        </div>
      </Card>

      {/* Kort 2: Fördelning */}
      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold">Fördelning</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hur länge jobbade du på varje projekt eller plats? Ange varaktighet – tiderna räknas ut automatiskt.
          </p>
        </div>

        {blocks.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Inga projekt än.</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button size="sm" variant="outline" onClick={fillFromWholeDay} disabled={disabled || isSubmitting}>
                Hela dagen på ett projekt
              </Button>
              <Button size="sm" variant="outline" onClick={addBlock} disabled={disabled || isSubmitting}>
                <Plus className="h-3.5 w-3.5 mr-1" />Lägg till projekt
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {blocks.map((b, idx) => {
            const minutes = b.durationMin;
            const isZero = minutes <= 0;
            const targetMissing = !b.target;
            const isOther = b.target?.targetType === 'other';
            const hours = Math.floor(Math.max(0, minutes) / 60);
            const mins = Math.max(0, minutes) % 60;
            return (
              <div
                key={b.id}
                className={`rounded-lg border bg-card p-3 space-y-2.5 ${
                  isZero ? 'border-destructive/50 bg-destructive/5' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Projekt {idx + 1}</span>
                    {b.sourceSegmentId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        GPS-förslag
                      </span>
                    )}
                    {isZero && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                        0 min – ta bort eller justera
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${isZero ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                    onClick={() => requestRemove(b)}
                    disabled={disabled || isSubmitting}
                    aria-label="Ta bort projekt"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Timmar</Label>
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      inputMode="numeric"
                      value={hours}
                      onChange={(e) => updateDuration(b.id, Number(e.target.value) || 0, mins)}
                      disabled={disabled || isSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Minuter</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      inputMode="numeric"
                      value={mins}
                      onChange={(e) => updateDuration(b.id, hours, Number(e.target.value) || 0)}
                      disabled={disabled || isSubmitting}
                    />
                  </div>
                  <div className="pb-1.5 text-xs text-muted-foreground tabular-nums">
                    = {fmtDuration(minutes)}
                  </div>
                </div>

                <button
                  onClick={() => setPickerId(b.id)}
                  disabled={disabled || isSubmitting}
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

                {isOther && (
                  <p className="text-[11px] text-amber-700">Ej kopplat till projektkostnad.</p>
                )}
              </div>
            );
          })}
        </div>

        {blocks.length > 0 && (
          <Button variant="outline" size="sm" onClick={addBlock} disabled={disabled || isSubmitting} className="w-full">
            <Plus className="h-4 w-4 mr-1.5" />
            Lägg till projekt
          </Button>
        )}
      </Card>

      {/* Kort 3: Skicka in */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Skicka in</h3>
        <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Dagens tid</span>
            <span className="font-medium">{fmtDuration(dayNet)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rast</span>
            <span className="font-medium">{dayBreak} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fördelat på projekt</span>
            <span className="font-medium">{fmtDuration(allocated)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-muted-foreground">
              {remaining >= 0 ? 'Kvar att fördela' : 'Överstiger dagen med'}
            </span>
            <span className={`font-semibold ${matchesDay ? '' : 'text-amber-700'}`}>
              {fmtDuration(Math.abs(remaining))}
            </span>
          </div>
        </div>

        {!matchesDay && allocated > 0 && (
          <p className="text-xs text-amber-700">
            {remaining > 0
              ? `Du har ${remaining} min kvar att fördela på projekt.`
              : `Projekten överstiger dagens arbetstid med ${Math.abs(remaining)} min.`}
          </p>
        )}
        {missingTargetBlocks.length > 0 && (
          <p className="text-xs text-amber-700">
            {missingTargetBlocks.length} projekt saknar valt projekt/plats.
          </p>
        )}
        {zeroBlocks.length > 0 && (
          <p className="text-xs text-destructive">
            {zeroBlocks.length} projekt har 0 min – ta bort eller justera.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="day-comment" className="text-xs">Kommentar till admin (valfri)</Label>
          <Textarea
            id="day-comment"
            rows={2}
            value={userComment}
            onChange={(e) => onUserCommentChange(e.target.value)}
            disabled={disabled || isSubmitting}
            placeholder="t.ex. omplanering, glömde slå på telefonen …"
          />
        </div>

        {disabled && disabledReason && (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        )}

        <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Skickar…</>
          ) : (
            <><Send className="h-4 w-4 mr-2" />Skicka in tidrapport</>
          )}
        </Button>
      </Card>

      <ManualWorkTargetPicker
        open={!!pickerId}
        onOpenChange={(o) => { if (!o) setPickerId(null); }}
        targets={targets}
        currentTarget={pickerActive?.target ?? null}
        onSelect={(t) => { if (pickerId) updateBlock(pickerId, { target: t }); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort detta projekt från tidrapporten?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.sourceSegmentId
                ? 'Detta är ett GPS-förslag. Borttaget projekt markeras som avvisat och syns för admin.'
                : 'Projektet tas bort från dagen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) removeBlockImmediate(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManualWorkSegmentsEditor;
