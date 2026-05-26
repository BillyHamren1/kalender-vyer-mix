import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCheck,
  MessageSquareWarning,
  ExternalLink,
  Clock3,
  Sun,
  Sunset,
  Coffee,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import TimeApprovalStatusBadge from "./TimeApprovalStatusBadge";
import {
  formatHm,
  type WeeklyDayCell,
  type WeeklyStaffBundle,
} from "./weeklyApprovalModel";
import DayInspectionMap from "./day-inspection/DayInspectionMap";
import {
  DiagnosticsCard,
  EngineProposalBanner,
  SegmentList,
  SubmissionExtrasCard,
  extractDiagnostics,
  extractSegments,
} from "./day-inspection/DayInspectionSections";


interface Props {
  open: boolean;
  bundle: WeeklyStaffBundle | null;
  day: WeeklyDayCell | null;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function engineMinutesFromCache(c: WeeklyDayCell["cache"]): number {
  if (!c) return 0;
  const s = (c.summary_json ?? null) as any;
  if (s && typeof s === "object") {
    if (num(s.payableMinutes) > 0) return Math.round(s.payableMinutes);
    if (num(s.workMinutes) > 0) return Math.round(s.workMinutes);
    if (num(s.totalMinutes) > 0) return Math.round(s.totalMinutes);
  }
  return 0;
}

const Kpi: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: "default" | "muted" | "warn" | "ok";
  icon?: React.ReactNode;
}> = ({ label, value, tone = "default", icon }) => {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : tone === "muted"
      ? "border-border/60 bg-muted/40 text-muted-foreground"
      : "border-border/70 bg-card";
  return (
    <div className={`flex flex-col rounded-md border px-2.5 py-1.5 min-w-[88px] ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-semibold tabular-nums leading-tight">{value}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Drawer
// ─────────────────────────────────────────────────────────────────────────────

export const StaffDayInspectionDrawer: React.FC<Props> = ({ open, bundle, day, onClose }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const approveDay = useApproveStaffDay();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState("");

  const staffId = bundle?.staff.id ?? null;
  const dateStr = day?.date ?? null;

  const dateLabel = useMemo(() => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "EEEE d MMMM yyyy", { locale: sv });
    } catch {
      return dateStr;
    }
  }, [dateStr]);

  const subMinutes = day?.minutes ?? 0;
  const engMinutes = day ? engineMinutesFromCache(day.cache) : 0;
  const diff = day?.submission && day.cache ? subMinutes - engMinutes : null;
  const breakMin = day?.submission?.break_minutes ?? 0;

  const submissionSegments = day?.submission
    ? extractSegments(day.submission.display_timeline_snapshot_json)
    : [];
  const cacheSegments = day
    ? extractSegments(day.cache?.display_blocks_json) ||
      extractSegments(day.cache?.report_candidate_blocks_json)
    : [];
  const segmentsToShow = submissionSegments.length > 0 ? submissionSegments : cacheSegments;
  const segmentsSource = submissionSegments.length > 0 ? "submission" : "engine";

  const diag = day ? extractDiagnostics(day) : null;
  const gpsHref =
    staffId && dateStr
      ? `/staff-management/gps-satellite-map?staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(dateStr)}`
      : "#";

  // Klipp kartans visit-durations vid dagens "Slut" (när dagen är inskickad)
  // så att tooltipen inte fortsätter ticka även om personalen står kvar på platsen.
  const mapClampEndIso = useMemo(() => {
    const sub = day?.submission;
    if (!sub || !dateStr) return null;
    const endHm = sub.end_time ? String(sub.end_time).slice(0, 5) : null;
    if (endHm && /^\d{2}:\d{2}$/.test(endHm)) {
      const d = new Date(`${dateStr}T${endHm}:00`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    if (sub.submitted_at) {
      const d = new Date(sub.submitted_at);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }, [day?.submission, dateStr]);

  const handleApprove = () => {
    if (!day?.submission) return;
    approveDay.mutate(
      { submission_id: day.submission.id, action: "approved" },
      {
        onSuccess: () => {
          toast({ title: "Dag godkänd", description: dateStr ?? "" });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Kunde inte godkänna", description: e.message, variant: "destructive" }),
      },
    );
  };

  const submitCorrection = () => {
    if (!day?.submission || !correctionText.trim()) return;
    approveDay.mutate(
      {
        submission_id: day.submission.id,
        action: "correction_requested",
        review_comment: correctionText.trim(),
      },
      {
        onSuccess: () => {
          toast({ title: "Komplettering begärd", description: dateStr ?? "" });
          setCorrectionOpen(false);
          setCorrectionText("");
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Misslyckades", description: e.message, variant: "destructive" }),
      },
    );
  };

  const openFullGps = () => {
    if (gpsHref === "#") return;
    navigate(gpsHref);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[1100px] p-0 flex flex-col gap-0"
      >
        {bundle && day && (
          <>
            {/* Header */}
            <SheetHeader className="px-4 py-3 border-b border-border/60 space-y-1">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base truncate">
                    {bundle.staff.name}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground capitalize">{dateLabel}</p>
                </div>
                <TimeApprovalStatusBadge status={day.uiStatus} />
              </div>
              {bundle.actionLabel && (
                <p className="text-[11px] text-muted-foreground">{bundle.actionLabel}</p>
              )}
            </SheetHeader>

            {/* KPI-rad */}
            <div className="px-4 py-2.5 border-b border-border/40 flex flex-wrap gap-1.5 bg-muted/20">
              <Kpi
                label="Förslag"
                value={engMinutes > 0 ? formatHm(engMinutes) : "–"}
                tone={engMinutes > 0 ? "default" : "muted"}
                icon={<Clock3 className="h-3 w-3" />}
              />
              <Kpi
                label="Inskickat"
                value={day.submission ? formatHm(subMinutes) : "–"}
                tone={day.submission ? "default" : "muted"}
                icon={<Clock3 className="h-3 w-3" />}
              />
              <Kpi
                label="Start"
                value={day.startLabel ?? "–"}
                tone="muted"
                icon={<Sun className="h-3 w-3" />}
              />
              <Kpi
                label="Slut"
                value={day.endLabel ?? "–"}
                tone="muted"
                icon={<Sunset className="h-3 w-3" />}
              />
              <Kpi
                label="Rast"
                value={breakMin > 0 ? `${breakMin}m` : "–"}
                tone="muted"
                icon={<Coffee className="h-3 w-3" />}
              />
              <Kpi
                label="GPS-pkt"
                value={diag?.pingCount ?? "–"}
                tone="muted"
                icon={<MapPin className="h-3 w-3" />}
              />
              {diff != null && Math.abs(diff) >= 30 && (
                <Kpi
                  label="Diff förslag→ins."
                  value={`${diff > 0 ? "+" : ""}${diff}m`}
                  tone="warn"
                />
              )}
            </div>

            {/* Innehåll: karta + sammanfattning */}
            <ScrollArea className="flex-1">
              <div className="p-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_360px] gap-3">
                {/* Karta + tidslinje (vänster) */}
                <div className="space-y-3 min-w-0">
                  <div className="relative h-[420px] rounded-lg border border-border/70 overflow-hidden bg-background">
                    {staffId && dateStr && (
                      <DayInspectionMap staffId={staffId} date={dateStr} open={open} />
                    )}
                  </div>

                  <div className="rounded-md border border-border/60 bg-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                        Tidslinje{" "}
                        {segmentsSource === "submission" ? "(inskickad)" : "(Time Engine-förslag)"}
                      </h4>
                      {diff != null && (
                        <span
                          className={`text-[10px] tabular-nums ${
                            Math.abs(diff) >= 30
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          förslag {formatHm(engMinutes)} → inskickat {formatHm(subMinutes)}
                          {diff !== 0 ? ` · ${diff > 0 ? "+" : ""}${diff}m` : ""}
                        </span>
                      )}
                    </div>
                    <SegmentList segments={segmentsToShow} />
                    {Math.abs(diff ?? 0) >= 30 && (
                      <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                        Stor skillnad mellan förslag och inskickad tid.
                      </div>
                    )}
                  </div>
                </div>

                {/* Höger sidopanel */}
                <div className="space-y-3 min-w-0">
                  {!day.submission && day.cache && !day.cache.error && <EngineProposalBanner />}
                  {day.submission && (
                    <div className="rounded-md border border-border/60 bg-card p-2.5 text-xs">
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                        Inskickad
                      </div>
                      <div>
                        Inskickad av personal{" "}
                        {day.submission.submitted_at
                          ? format(new Date(day.submission.submitted_at), "d MMM HH:mm", {
                              locale: sv,
                            })
                          : ""}
                      </div>
                      <div className="text-muted-foreground mt-0.5">{day.uiStatusLabel}</div>
                    </div>
                  )}
                  {diag && <DiagnosticsCard diag={diag} />}
                  <SubmissionExtrasCard day={day} />
                </div>
              </div>
            </ScrollArea>

            {/* Sticky footer */}
            <footer className="px-4 py-3 border-t border-border/60 bg-card flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openFullGps}
                className="gap-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Öppna full GPS
              </Button>
              <div className="flex items-center gap-2">
                {day.uiStatus === "pending_staff_attest" && (
                  <span className="text-xs text-indigo-700 dark:text-indigo-300 italic">
                    Väntar på personalattest
                  </span>
                )}
                {day.uiStatus === "correction_requested" && (
                  <span className="text-xs text-rose-700 dark:text-rose-300 italic">
                    Väntar på svar från personal
                  </span>
                )}
                {(day.uiStatus === "approved" || day.uiStatus === "payroll_approved") && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 italic">
                    {day.uiStatusLabel}
                  </span>
                )}
                {day.isAdminApprovable && day.submission && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={approveDay.isPending}
                      onClick={() => setCorrectionOpen(true)}
                    >
                      <MessageSquareWarning className="h-3.5 w-3.5" />
                      Begär komplettering
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={approveDay.isPending}
                      onClick={handleApprove}
                    >
                      <CheckCheck className="h-4 w-4" />
                      Godkänn dag
                    </Button>
                  </>
                )}
              </div>
            </footer>

            <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Begär komplettering – {dateStr}</DialogTitle>
                </DialogHeader>
                <Textarea
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  placeholder="Förklara för personen vad som behöver kompletteras…"
                  rows={5}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
                    Avbryt
                  </Button>
                  <Button
                    disabled={!correctionText.trim() || approveDay.isPending}
                    onClick={submitCorrection}
                  >
                    Skicka begäran
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StaffDayInspectionDrawer;
