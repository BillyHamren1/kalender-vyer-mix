/**
 * MobileDaySubmitSheet — mobilens dag-sheet för granska & skicka in.
 *
 * Läser dagen via `get-mobile-staff-day-report` (samma resolver som
 * Tid & Lön och Time Approvals). Skickar in via `submit-staff-day-v3`.
 *
 * Får ALDRIG anropa:
 *   - get-mobile-gps-day-view
 *   - submit-mobile-gps-day-v2
 *   - staff_location_history / pings-byggare
 */
import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { useMobileStaffDayReport } from '@/hooks/useMobileStaffDayReport';
import { useSubmitStaffDayReport } from '@/hooks/useSubmitStaffDayReport';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';

interface Props {
  date: string | null;
  reviewComment?: string | null;
  onClose: () => void;
  onSubmitted?: (date: string) => void;
}

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

/** "HH:mm" + datum → ISO i Stockholm-lokal kontext (best-effort). */
function isoFromHhmm(date: string, hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  // Vi vill ha en ISO som submit-staff-day-v3 accepterar och vars
  // Stockholm-lokala datum === `date`. Bygg via Date.parse i UTC och
  // korrigera så att stockholmDateOf() i edge funkar.
  // Enklast: använd "YYYY-MM-DDTHH:mm:00+02:00" (Sommartid antas — backend
  // konverterar tillbaka via Intl, så zonsuffixet är bara hint).
  // För robusthet bygger vi som lokal datum-tid och låter backend
  // göra Stockholm-mappingen.
  return `${date}T${hhmm}:00`;
}

const MobileDaySubmitSheet: React.FC<Props> = ({ date, reviewComment, onClose, onSubmitted }) => {
  const { report, isLoading, error, refresh } = useMobileStaffDayReport(date ?? undefined);
  const { submitDayReport, isSaving } = useSubmitStaffDayReport();

  const [startHhmm, setStartHhmm] = useState<string>('');
  const [endHhmm, setEndHhmm] = useState<string>('');
  const [breakStr, setBreakStr] = useState<string>('30');
  const [comment, setComment] = useState<string>('');

  // Initiera fälten från resolvern när dagen laddats.
  useEffect(() => {
    if (!date || !report) return;
    const sub = report.submission;
    const startIso = sub?.requestedStartAt
      ?? report.segments[0]?.startedAt
      ?? null;
    const endIso = sub?.requestedEndAt
      ?? report.segments[report.segments.length - 1]?.endedAt
      ?? null;
    setStartHhmm(hhmmFromIso(startIso));
    setEndHhmm(hhmmFromIso(endIso));
    setBreakStr(String(sub?.breakMinutes ?? 30));
    setComment(sub?.comment ?? '');
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

  const canSubmit =
    !!date && !isLocked && !isSaving && grossMin > 0 && netMin > 0;

  const handleSubmit = async () => {
    if (!date) return;
    if (!report) {
      toast.error('Dagen är inte laddad än');
      return;
    }
    try {
      // Snapshot av exakt det användaren såg när hen skickade in.
      // Mobilen bygger ALDRIG om dagen — vi skickar bara med vad cachen
      // levererade så admin/AI kan revidera underlaget i efterhand.
      const displayTimelineSnapshot = report.segments.map((s) => ({
        blockId: s.sourceBlockId || s.id,
        startAtIso: s.startedAt,
        endAtIso: s.endedAt,
        allocationType: s.kind,
        targetType: s.projectId ? 'project'
          : s.largeProjectId ? 'large_project'
          : s.bookingId ? 'booking'
          : s.locationId ? 'location'
          : null,
        targetId: s.projectId ?? s.largeProjectId ?? s.bookingId ?? s.locationId ?? null,
        label: s.label,
      }));
      await submitDayReport({
        staffId: report.staffId,
        date,
        breakMinutes: breakMin,
        comment: comment.trim() || null,
        requestedStartAt: isoFromHhmm(date, startHhmm),
        requestedEndAt: isoFromHhmm(date, endHhmm),
        userEdits: [], // sheet redigerar bara start/slut/rast/kommentar
        displayTimelineSnapshot,
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
          <MobileBackHeader
            title={date ? formatNiceDate(date) : ''}
            onBack={onClose}
          />
          <div className="px-4 pt-4 pb-6 space-y-3">
            {reviewComment && status === 'correction_requested' && (
              <Card className="p-3 border-rose-200 bg-rose-50 text-rose-900">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">
                  Komplettering begärd
                </p>
                <p className="text-sm">{reviewComment}</p>
              </Card>
            )}

            {isLoading && !report && (
              <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar dagen…
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
                      <Input
                        type="time"
                        value={startHhmm}
                        onChange={(e) => setStartHhmm(e.target.value)}
                        disabled={isLocked || isSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Slut</Label>
                      <Input
                        type="time"
                        value={endHhmm}
                        onChange={(e) => setEndHhmm(e.target.value)}
                        disabled={isLocked || isSaving}
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
                        disabled={isLocked || isSaving}
                      />
                    </div>
                  </div>
                </Card>

                {/* 2) Tidslinje (read-only — bygger på cache via resolver) */}
                <Card className="p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tidslinje
                    </h3>
                    {report.segments.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Från GPS-motor
                      </Badge>
                    )}
                  </div>

                  {report.segments.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        Ingen registrerad tid idag.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-1 px-1">
                      {report.segments.map((s) => (
                        <li key={s.id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                          <span className="flex items-baseline gap-1.5 min-w-0">
                            <span className={
                              `inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                s.kind === 'travel' ? 'bg-sky-500'
                                : s.kind === 'break' ? 'bg-violet-500'
                                : s.kind === 'unknown' || s.kind === 'needs_review' ? 'bg-amber-500'
                                : 'bg-emerald-500'
                              }`
                            } />
                            <span className="truncate">{s.label}</span>
                            {s.startedAt && s.endedAt && (
                              <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
                                {hhmmFromIso(s.startedAt)}–{hhmmFromIso(s.endedAt)}
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums text-muted-foreground shrink-0 text-[11px]">
                            {fmtDur(s.durationMinutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {/* 3) Kommentar */}
                <Card className="p-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Kommentar till admin
                  </Label>
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
                    <Button
                      className="w-full h-12 text-base"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                    >
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
