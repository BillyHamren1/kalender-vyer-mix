/**
 * QuickTimeEntrySheet
 * -------------------
 * Busenkel manuell tidsrapportering mot projekt/bokning.
 *
 * Viktigt: komponenten skapar INGEN ny skrivväg. Den läser dagens auktoritativa
 * mobilrapport och skickar ett add_manual_block via submit-staff-day-v3.
 * Om dagen redan har skickats in återanvänds den frysta submission-snapshoten,
 * så att tidigare manuella pass inte skrivs över när ännu ett pass läggs till.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock3, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMobileStaffDayReport } from '@/hooks/useMobileStaffDayReport';
import {
  useSubmitStaffDayReport,
  type SubmitStaffDayDisplayBlock,
  type SubmitStaffDayUserEdit,
} from '@/hooks/useSubmitStaffDayReport';
import { TargetPicker, type TargetType } from './MobileDaySubmitSheet';
import type { MobileSegment } from '@/types/mobileDayReport';
import { stockholmLocalIsoFromHhmm } from '@/lib/staff/stockholmLocalIso';

export interface QuickTimeTarget {
  type: Exclude<TargetType, null>;
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  fixedTarget?: QuickTimeTarget | null;
  onSaved?: (date: string) => void;
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* fallback below */ }
  return `manual-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function isoFromHhmm(date: string, hhmm: string): string | null {
  return stockholmLocalIsoFromHhmm(date, hhmm);
}

function hhmmFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(start: string, end: string): number {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function fmtMinutes(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

function segmentTargetType(s: MobileSegment): string | null {
  if (s.projectId) return 'project';
  if (s.largeProjectId) return 'large_project';
  if (s.bookingId) return 'booking';
  if (s.locationId) return 'location';
  return null;
}

function segmentTargetId(s: MobileSegment): string | null {
  return s.projectId ?? s.largeProjectId ?? s.bookingId ?? s.locationId ?? null;
}

function segmentToSnapshot(s: MobileSegment): SubmitStaffDayDisplayBlock {
  return {
    blockId: s.sourceBlockId || s.id,
    startAtIso: s.startedAt,
    endAtIso: s.endedAt,
    allocationType: s.kind,
    targetType: segmentTargetType(s),
    targetId: segmentTargetId(s),
    label: s.label,
  };
}

function readBlockStart(block: any): string | null {
  return block?.startAtIso ?? block?.start_at_iso ?? block?.start_at ?? block?.startedAt ?? null;
}

function readBlockEnd(block: any): string | null {
  return block?.endAtIso ?? block?.end_at_iso ?? block?.end_at ?? block?.endedAt ?? null;
}

export default function QuickTimeEntrySheet({
  open,
  onOpenChange,
  defaultDate,
  fixedTarget = null,
  onSaved,
}: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(defaultDate ?? today);
  const { report, isLoading, error, refresh } = useMobileStaffDayReport(open ? date : undefined);
  const { submitDayReport, isSaving } = useSubmitStaffDayReport();

  const [target, setTarget] = useState<{ type: TargetType; id: string | null; label: string }>({
    type: fixedTarget?.type ?? null,
    id: fixedTarget?.id ?? null,
    label: fixedTarget?.label ?? '',
  });
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('09:00');
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [defaultsForDate, setDefaultsForDate] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate ?? today);
    setTarget({
      type: fixedTarget?.type ?? null,
      id: fixedTarget?.id ?? null,
      label: fixedTarget?.label ?? '',
    });
    setComment('');
    setCommentOpen(false);
    setDefaultsForDate(null);
  }, [open, defaultDate, fixedTarget?.type, fixedTarget?.id, fixedTarget?.label, today]);

  const baseSnapshot = useMemo<SubmitStaffDayDisplayBlock[]>(() => {
    if (!report) return [];
    if (Array.isArray(report.submissionTimelineSnapshot) && report.submissionTimelineSnapshot.length > 0) {
      return report.submissionTimelineSnapshot
        .filter((b: any) => b && readBlockStart(b))
        .map((b: any) => ({ ...b })) as SubmitStaffDayDisplayBlock[];
    }
    return report.segments.map(segmentToSnapshot);
  }, [report]);

  useEffect(() => {
    if (!open || !report || defaultsForDate === date) return;
    const existingEnds = baseSnapshot.map(readBlockEnd).filter(Boolean) as string[];
    existingEnds.sort((a, b) => Date.parse(a) - Date.parse(b));
    const lastEnd = existingEnds.length > 0 ? existingEnds[existingEnds.length - 1] : (report.submission?.requestedEndAt ?? null);
    const suggestedStart = hhmmFromIso(lastEnd) ?? '08:00';
    setStart(suggestedStart);
    setEnd(addMinutes(suggestedStart, 60));
    setDefaultsForDate(date);
  }, [open, report, baseSnapshot, date, defaultsForDate]);

  const duration = minutesBetween(start, end);
  const locked = report?.submission?.status === 'approved';
  const canSave = Boolean(
    report &&
    target.id &&
    target.type &&
    duration > 0 &&
    duration <= 16 * 60 &&
    !locked &&
    !isSaving,
  );

  const handleSave = async () => {
    if (!report) return;
    if (!target.id || !target.type) {
      toast.error('Välj projekt');
      return;
    }
    const blockStart = isoFromHhmm(date, start);
    const blockEnd = isoFromHhmm(date, end);
    if (!blockStart || !blockEnd || duration <= 0) {
      toast.error('Kontrollera start- och sluttid');
      return;
    }
    if (duration > 16 * 60) {
      toast.error('Ett arbetspass kan inte vara längre än 16 timmar');
      return;
    }

    const existingStarts = baseSnapshot.map(readBlockStart).filter(Boolean) as string[];
    const existingEnds = baseSnapshot.map(readBlockEnd).filter(Boolean) as string[];
    const requestedStartCandidates = [report.submission?.requestedStartAt, ...existingStarts, blockStart].filter(Boolean) as string[];
    const requestedEndCandidates = [report.submission?.requestedEndAt, ...existingEnds, blockEnd].filter(Boolean) as string[];
    const requestedStartAt = requestedStartCandidates.reduce((best, value) =>
      Date.parse(value) < Date.parse(best) ? value : best, blockStart);
    const requestedEndAt = requestedEndCandidates.reduce((best, value) =>
      Date.parse(value) > Date.parse(best) ? value : best, blockEnd);

    const edit: SubmitStaffDayUserEdit = {
      editId: uuid(),
      sourceDisplayBlockId: null,
      editType: 'add_manual_block',
      previousValue: null,
      newValue: {
        blockId: uuid(),
        startAtIso: blockStart,
        endAtIso: blockEnd,
        allocationType: 'manual_user_added',
        targetType: target.type,
        targetId: target.id,
        label: target.label,
        comment: comment.trim() || null,
      },
      userReason: null,
      createdAt: new Date().toISOString(),
    };

    try {
      await submitDayReport({
        staffId: report.staffId,
        date,
        breakMinutes: report.submission?.breakMinutes ?? 0,
        comment: report.submission?.comment ?? null,
        requestedStartAt,
        requestedEndAt,
        userEdits: [edit],
        displayTimelineSnapshot: baseSnapshot,
      });
      toast.success('Tiden är rapporterad');
      await refresh();
      onSaved?.(date);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte rapportera tiden');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-4 pb-8">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Clock3 className="h-5 w-5" /> Rapportera tid
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value);
                setDefaultsForDate(null);
              }}
              disabled={isSaving}
              className="h-12 text-base"
            />
          </div>

          {!fixedTarget ? (
            <TargetPicker date={date} value={target} onChange={setTarget} disabled={isSaving} />
          ) : (
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Projekt</p>
              <p className="font-semibold mt-0.5">{fixedTarget.label}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Från</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={isSaving} className="h-14 text-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Till</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={isSaving} className="h-14 text-lg" />
            </div>
          </div>

          <div className="rounded-2xl border bg-primary/5 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rapporterad tid</span>
            <span className="text-xl font-bold tabular-nums">{fmtMinutes(duration)}</span>
          </div>

          {!commentOpen ? (
            <Button type="button" variant="ghost" className="w-full justify-start px-0 text-muted-foreground" onClick={() => setCommentOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Lägg till kommentar
            </Button>
          ) : (
            <div className="space-y-1.5">
              <Label>Kommentar <span className="text-muted-foreground font-normal">(frivilligt)</span></Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="resize-none" />
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Hämtar dagen…
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {locked && <p className="text-sm text-destructive">Dagen är redan godkänd och kan inte ändras.</p>}

          <Button onClick={handleSave} disabled={!canSave} className="w-full h-14 text-base font-semibold rounded-xl">
            {isSaving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
            Spara tid
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
