/**
 * MobileDaySubmitSheet — mobilens dag-sheet för granska, redigera & skicka in.
 *
 * Läser dagen via `get-mobile-staff-day-report` (samma resolver som
 * Tid & Lön och Time Approvals). Skickar in via `submit-staff-day-v3`.
 *
 * Användaren kan:
 *   - ändra start/slut på befintliga tidslinjeblock
 *   - länka block till annat projekt/booking/large_project/location
 *   - lägga kommentar på block
 *   - LÄGGA TILL nytt manuellt projekt/plats-block (knappen under tidslinjen)
 *
 * Får ALDRIG anropa:
 *   - get-mobile-gps-day-view
 *   - submit-mobile-gps-day-v2
 *   - staff_location_history / pings-byggare
 *   - ManualWorkSegmentsEditor eller annan gammal fördelningsvy
 */
import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle2, Plus, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { useMobileStaffDayReport } from '@/hooks/useMobileStaffDayReport';
import {
  useSubmitStaffDayReport,
  type SubmitStaffDayUserEdit,
  type SubmitStaffDayDisplayBlock,
} from '@/hooks/useSubmitStaffDayReport';
import { useMobileBookings } from '@/hooks/useMobileData';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { MobileSegment } from '@/types/mobileDayReport';

interface Props {
  date: string | null;
  reviewComment?: string | null;
  onClose: () => void;
  onSubmitted?: (date: string) => void;
}

// ── helpers ─────────────────────────────────────────────────────────
function formatNiceDate(date: string): string {
  try { return format(parseISO(date), 'EEEE d MMMM', { locale: sv }); }
  catch { return date; }
}

function fmtDur(min: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function hhmmFromIso(iso: string | null): string {
  if (!iso) return '';
  try { return formatStockholmHm(iso); } catch { return ''; }
}

function isoFromHhmm(date: string, hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return `${date}T${hhmm}:00`;
}

function durMinutes(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  const a = Date.parse(startIso); const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  } catch { /* ignore */ }
  return 'manual-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── lokal vy-modell för redigering ──────────────────────────────────
type TargetType = 'booking' | 'project' | 'large_project' | 'location' | null;

interface EditableBlock {
  id: string;                  // sourceBlockId för engine-block; uuid för manuella
  isManual: boolean;
  startHhmm: string;
  endHhmm: string;
  targetType: TargetType;
  targetId: string | null;
  label: string;
  comment: string;
  // ursprungsdata för diff
  origStartIso: string;
  origEndIso: string | null;
  origTargetType: TargetType;
  origTargetId: string | null;
  origLabel: string;
  // för visuell färgkodning av engine-block
  kind?: MobileSegment['kind'];
}

function segmentTargetType(s: MobileSegment): TargetType {
  if (s.projectId) return 'project';
  if (s.largeProjectId) return 'large_project';
  if (s.bookingId) return 'booking';
  if (s.locationId) return 'location';
  return null;
}
function segmentTargetId(s: MobileSegment): string | null {
  return s.projectId ?? s.largeProjectId ?? s.bookingId ?? s.locationId ?? null;
}

function segmentToEditable(s: MobileSegment): EditableBlock {
  const tt = segmentTargetType(s);
  return {
    id: s.sourceBlockId || s.id,
    isManual: false,
    startHhmm: hhmmFromIso(s.startedAt),
    endHhmm: hhmmFromIso(s.endedAt),
    targetType: tt,
    targetId: segmentTargetId(s),
    label: s.label,
    comment: '',
    origStartIso: s.startedAt,
    origEndIso: s.endedAt,
    origTargetType: tt,
    origTargetId: segmentTargetId(s),
    origLabel: s.label,
    kind: s.kind,
  };
}

// ── Target picker ──────────────────────────────────────────────────
interface TargetOption {
  type: Exclude<TargetType, null>;
  id: string;
  label: string;
  sub?: string;
}

const TargetPicker: React.FC<{
  date: string;
  value: { type: TargetType; id: string | null; label: string };
  onChange: (next: { type: TargetType; id: string | null; label: string }) => void;
  disabled?: boolean;
}> = ({ date, value, onChange, disabled }) => {
  const { data: bookings = [] } = useMobileBookings();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const options = useMemo<TargetOption[]>(() => {
    const out: TargetOption[] = [];
    const seenLarge = new Set<string>();
    for (const b of bookings as any[]) {
      const onThisDay = Array.isArray(b.assignment_dates) && b.assignment_dates.includes(date);
      if (b.large_project_id) {
        if (!seenLarge.has(b.large_project_id)) {
          seenLarge.add(b.large_project_id);
          out.push({
            type: 'large_project',
            id: b.large_project_id,
            label: b.large_project_name || 'Stort projekt',
            sub: onThisDay ? 'Idag' : (b.eventdate ?? b.rigdaydate ?? undefined),
          });
        }
      } else {
        out.push({
          type: 'booking',
          id: b.id,
          label: b.client || b.booking_number || 'Bokning',
          sub: onThisDay ? 'Idag' : (b.eventdate ?? b.rigdaydate ?? undefined),
        });
      }
    }
    // Sortera: idag först
    out.sort((a, b) => {
      const ai = a.sub === 'Idag' ? 0 : 1;
      const bi = b.sub === 'Idag' ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label, 'sv');
    });
    return out;
  }, [bookings, date]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 30);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30);
  }, [options, query]);

  const display = value.id ? value.label : 'Ej kopplat';

  return (
    <div className="space-y-1">
      <Label className="text-[11px]">Projekt / plats</Label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm text-left disabled:opacity-50"
      >
        <span className="truncate">{display}</span>
        {open ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
      </button>
      {open && (
        <div className="border rounded-md bg-card p-2 space-y-2 max-h-72 overflow-y-auto">
          <Input
            autoFocus
            placeholder="Sök projekt eller kund…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
          {value.id && (
            <button
              type="button"
              onClick={() => { onChange({ type: null, id: null, label: '' }); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground"
            >
              Ta bort koppling
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">Inga träffar.</p>
          ) : filtered.map((o) => (
            <button
              key={`${o.type}:${o.id}`}
              type="button"
              onClick={() => {
                onChange({ type: o.type, id: o.id, label: o.label });
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between gap-2"
            >
              <span className="truncate text-sm">{o.label}</span>
              {o.sub && <span className="text-[10px] text-muted-foreground shrink-0">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Block-rad (kollapsad / expanderad redigering) ──────────────────
const BlockRow: React.FC<{
  block: EditableBlock;
  date: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: EditableBlock) => void;
  onRemove?: () => void;
  disabled?: boolean;
}> = ({ block, date, expanded, onToggle, onChange, onRemove, disabled }) => {
  const startIso = isoFromHhmm(date, block.startHhmm);
  const endIso = isoFromHhmm(date, block.endHhmm);
  const mins = durMinutes(startIso, endIso);
  const dotColor =
    block.kind === 'travel' ? 'bg-sky-500'
    : block.kind === 'break' ? 'bg-violet-500'
    : block.kind === 'unknown' || block.kind === 'needs_review' ? 'bg-amber-500'
    : block.isManual ? 'bg-primary'
    : 'bg-emerald-500';

  return (
    <li className="rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-baseline justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="truncate text-[13px]">{block.label || 'Ej kopplat'}</span>
          {block.isManual && <Badge variant="outline" className="text-[9px] px-1 py-0">Manuell</Badge>}
          <span className="text-[10px] tabular-nums text-muted-foreground/70 shrink-0">
            {block.startHhmm}–{block.endHhmm}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="tabular-nums text-muted-foreground text-[11px]">{fmtDur(mins)}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 opacity-60" /> : <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Start</Label>
              <Input
                type="time"
                value={block.startHhmm}
                disabled={disabled}
                onChange={(e) => onChange({ ...block, startHhmm: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Slut</Label>
              <Input
                type="time"
                value={block.endHhmm}
                disabled={disabled}
                onChange={(e) => onChange({ ...block, endHhmm: e.target.value })}
              />
            </div>
          </div>
          <TargetPicker
            date={date}
            disabled={disabled}
            value={{ type: block.targetType, id: block.targetId, label: block.label }}
            onChange={(next) => onChange({
              ...block,
              targetType: next.type,
              targetId: next.id,
              label: next.label || block.label,
            })}
          />
          <div className="space-y-1">
            <Label className="text-[11px]">Kommentar</Label>
            <Textarea
              rows={2}
              value={block.comment}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, comment: e.target.value })}
              placeholder="Frivilligt"
              className="resize-none text-sm"
            />
          </div>
          {onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
              disabled={disabled}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Ta bort manuellt block
            </Button>
          )}
        </div>
      )}
    </li>
  );
};

// ── Huvudkomponent ─────────────────────────────────────────────────
const MobileDaySubmitSheet: React.FC<Props> = ({ date, reviewComment, onClose, onSubmitted }) => {
  const { report, isLoading, error, refresh } = useMobileStaffDayReport(date ?? undefined);
  const { submitDayReport, isSaving } = useSubmitStaffDayReport();

  const [startHhmm, setStartHhmm] = useState<string>('');
  const [endHhmm, setEndHhmm] = useState<string>('');
  const [breakStr, setBreakStr] = useState<string>('30');
  const [comment, setComment] = useState<string>('');
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Initiera fälten från resolvern när dagen laddats.
  useEffect(() => {
    if (!date || !report) return;
    const sub = report.submission;
    const startIso = sub?.requestedStartAt ?? report.segments[0]?.startedAt ?? null;
    const endIso = sub?.requestedEndAt ?? report.segments[report.segments.length - 1]?.endedAt ?? null;
    setStartHhmm(hhmmFromIso(startIso));
    setEndHhmm(hhmmFromIso(endIso));
    setBreakStr(String(sub?.breakMinutes ?? 30));
    setComment(sub?.comment ?? '');
    setBlocks(report.segments.map(segmentToEditable));
    setExpanded(null);
  }, [date, report]);

  const status = report?.submission?.status ?? null;
  const isLocked = status === 'approved';
  const isSubmittedWaiting = status === 'submitted';

  const grossMin = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(startHhmm) || !/^\d{2}:\d{2}$/.test(endHhmm)) return 0;
    const [sh, sm] = startHhmm.split(':').map(Number);
    const [eh, em] = endHhmm.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return mins;
  }, [startHhmm, endHhmm]);
  const breakMin = Math.max(0, Math.round(Number(breakStr) || 0));
  const netMin = Math.max(0, grossMin - breakMin);

  const canSubmit = !!date && !isLocked && !isSaving && grossMin > 0 && netMin > 0;

  const addManualBlock = () => {
    if (!date) return;
    const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].endHhmm : startHhmm || '08:00';
    const defStart = /^\d{2}:\d{2}$/.test(lastEnd) ? lastEnd : '08:00';
    const [h, m] = defStart.split(':').map(Number);
    const endTotal = Math.min(23 * 60 + 59, h * 60 + m + 60);
    const defEnd = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
    const id = uuid();
    const nb: EditableBlock = {
      id,
      isManual: true,
      startHhmm: defStart,
      endHhmm: defEnd,
      targetType: null,
      targetId: null,
      label: '',
      comment: '',
      origStartIso: '',
      origEndIso: null,
      origTargetType: null,
      origTargetId: null,
      origLabel: '',
    };
    setBlocks((prev) => [...prev, nb]);
    setExpanded(id);
  };

  const handleSubmit = async () => {
    if (!date || !report) {
      toast.error('Dagen är inte laddad än');
      return;
    }
    try {
      // 1) Bygg snapshot av exakt vad användaren SÅG (engine-blocken).
      const snapshot: SubmitStaffDayDisplayBlock[] = report.segments.map((s) => ({
        blockId: s.sourceBlockId || s.id,
        startAtIso: s.startedAt,
        endAtIso: s.endedAt,
        allocationType: s.kind,
        targetType: segmentTargetType(s),
        targetId: segmentTargetId(s),
        label: s.label,
      }));

      // 2) Bygg userEdits från diff mellan blocks (lokal state) och original.
      const edits: SubmitStaffDayUserEdit[] = [];
      const now = new Date().toISOString();
      for (const b of blocks) {
        if (b.isManual) {
          edits.push({
            editId: uuid(),
            sourceDisplayBlockId: null,
            editType: 'add_manual_block',
            previousValue: null,
            newValue: {
              blockId: b.id,
              startAtIso: isoFromHhmm(date, b.startHhmm),
              endAtIso: isoFromHhmm(date, b.endHhmm),
              allocationType: 'manual_user_added',
              targetType: b.targetType,
              targetId: b.targetId,
              label: b.label || null,
              comment: b.comment.trim() || null,
            },
            userReason: null,
            createdAt: now,
          });
          continue;
        }
        const newStartIso = isoFromHhmm(date, b.startHhmm);
        const newEndIso = isoFromHhmm(date, b.endHhmm);
        if (newStartIso && hhmmFromIso(b.origStartIso) !== b.startHhmm) {
          edits.push({
            editId: uuid(),
            sourceDisplayBlockId: b.id,
            editType: 'change_block_start',
            previousValue: b.origStartIso,
            newValue: newStartIso,
            userReason: null,
            createdAt: now,
          });
        }
        if (newEndIso && hhmmFromIso(b.origEndIso) !== b.endHhmm) {
          edits.push({
            editId: uuid(),
            sourceDisplayBlockId: b.id,
            editType: 'change_block_end',
            previousValue: b.origEndIso,
            newValue: newEndIso,
            userReason: null,
            createdAt: now,
          });
        }
        if (b.targetId !== b.origTargetId || b.targetType !== b.origTargetType) {
          edits.push({
            editId: uuid(),
            sourceDisplayBlockId: b.id,
            editType: 'link_block_to_project',
            previousValue: { targetType: b.origTargetType, targetId: b.origTargetId },
            newValue: { targetType: b.targetType, targetId: b.targetId, label: b.label },
            userReason: null,
            createdAt: now,
          });
        }
        if (b.comment.trim()) {
          edits.push({
            editId: uuid(),
            sourceDisplayBlockId: b.id,
            editType: 'add_block_comment',
            previousValue: null,
            newValue: b.comment.trim(),
            userReason: null,
            createdAt: now,
          });
        }
      }

      await submitDayReport({
        staffId: report.staffId,
        date,
        breakMinutes: breakMin,
        comment: comment.trim() || null,
        requestedStartAt: isoFromHhmm(date, startHhmm),
        requestedEndAt: isoFromHhmm(date, endHhmm),
        userEdits: edits,
        displayTimelineSnapshot: snapshot,
      });
      toast.success('Tidrapport inskickad – väntar godkännande');
      onSubmitted?.(date);
      void refresh();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka in');
    }
  };

  return (
    <Sheet open={date !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col rounded-t-2xl">
        <div className="flex-1 overflow-y-auto">
          <MobileBackHeader title={date ? formatNiceDate(date) : ''} onBack={onClose} />
          <div className="px-4 pt-4 pb-6 space-y-3">
            {reviewComment && status === 'correction_requested' && (
              <Card className="p-3 border-rose-200 bg-rose-50 text-rose-900">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">Komplettering begärd</p>
                <p className="text-sm">{reviewComment}</p>
              </Card>
            )}

            {isLoading && !report && (
              <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Laddar dagen…
              </Card>
            )}
            {error && !isLoading && (
              <Card className="p-4 border-destructive/40 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
                  Försök igen
                </Button>
              </Card>
            )}

            {report && date && (
              <>
                {/* 1) Arbetstid */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Arbetstid</h3>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {grossMin > 0 ? fmtDur(netMin) : '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Start</Label>
                      <Input type="time" value={startHhmm} onChange={(e) => setStartHhmm(e.target.value)} disabled={isLocked || isSaving} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Slut</Label>
                      <Input type="time" value={endHhmm} onChange={(e) => setEndHhmm(e.target.value)} disabled={isLocked || isSaving} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Rast (min)</Label>
                      <Input type="number" min={0} inputMode="numeric" value={breakStr} onChange={(e) => setBreakStr(e.target.value)} disabled={isLocked || isSaving} />
                    </div>
                  </div>
                </Card>

                {/* 2) Tidslinje — redigerbar */}
                <Card className="p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tidslinje
                    </h3>
                    {report.segments.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Från GPS-motor</Badge>
                    )}
                  </div>

                  {blocks.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center">
                      <p className="text-sm text-muted-foreground">Ingen registrerad tid idag.</p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5 px-1">
                      {blocks.map((b) => (
                        <BlockRow
                          key={b.id}
                          block={b}
                          date={date}
                          expanded={expanded === b.id}
                          onToggle={() => setExpanded((cur) => (cur === b.id ? null : b.id))}
                          onChange={(next) => setBlocks((prev) => prev.map((x) => (x.id === b.id ? next : x)))}
                          onRemove={b.isManual ? () => {
                            setBlocks((prev) => prev.filter((x) => x.id !== b.id));
                            if (expanded === b.id) setExpanded(null);
                          } : undefined}
                          disabled={isLocked || isSaving}
                        />
                      ))}
                    </ul>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addManualBlock}
                    disabled={isLocked || isSaving}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Lägg till projekt / plats
                  </Button>
                </Card>

                {/* 3) Kommentar */}
                <Card className="p-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Kommentar till admin</Label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Frivilligt – t.ex. övertid, problem eller övrig info."
                    rows={2}
                    disabled={isLocked || isSaving}
                    className="resize-none"
                  />
                </Card>

                {/* 4) Skicka in */}
                <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 bg-gradient-to-t from-background via-background to-background/80">
                  {isLocked ? (
                    <Card className="p-3 flex items-center gap-2 bg-primary/5 border-primary/30">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">Godkänd</span>
                    </Card>
                  ) : (
                    <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={!canSubmit}>
                      {isSaving
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <Send className="h-4 w-4 mr-2" />}
                      {isSubmittedWaiting ? 'Uppdatera tidrapport' : 'Skicka in tidrapport'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileDaySubmitSheet;
