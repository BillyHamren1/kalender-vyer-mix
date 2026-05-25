import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, CheckCheck, Clock3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useApproveStaffDay } from "@/hooks/staff/useApproveStaffDay";
import { useApproveStaffWeek, NoApprovableError } from "@/hooks/staff/useApproveStaffWeek";
import StaffDayApprovalRow from "./StaffDayApprovalRow";
import StaffDayApprovalDetails from "./StaffDayApprovalDetails";
import {
  formatHm,
  isWeekFullyApprovable,
  type WeeklyStaffBundle,
} from "./weeklyApprovalModel";

interface Props {
  bundle: WeeklyStaffBundle;
  weekNumber: number;
  weekRangeLabel: string;
  onClose: () => void;
  onOpenDay?: (day: import("./weeklyApprovalModel").WeeklyDayCell) => void;
}

export const StaffWeeklyApprovalPanel: React.FC<Props> = ({
  bundle,
  weekNumber,
  weekRangeLabel,
  onClose,
  onOpenDay,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [correctionFor, setCorrectionFor] = useState<{ id: string; date: string } | null>(null);
  const [correctionText, setCorrectionText] = useState("");

  const approveDay = useApproveStaffDay();
  const approveWeek = useApproveStaffWeek();

  const handleApproveDay = (submissionId: string, date: string) => {
    approveDay.mutate(
      { submission_id: submissionId, action: "approved" },
      {
        onSuccess: () => toast({ title: "Dag godkänd", description: date }),
        onError: (e: any) =>
          toast({ title: "Kunde inte godkänna", description: e.message, variant: "destructive" }),
      },
    );
  };

  const submitCorrection = () => {
    if (!correctionFor || !correctionText.trim()) return;
    approveDay.mutate(
      {
        submission_id: correctionFor.id,
        action: "correction_requested",
        review_comment: correctionText.trim(),
      },
      {
        onSuccess: () => {
          toast({ title: "Komplettering begärd", description: correctionFor.date });
          setCorrectionFor(null);
          setCorrectionText("");
        },
        onError: (e: any) =>
          toast({ title: "Misslyckades", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleApproveAll = () => {
    approveWeek.mutate(
      { submissions: bundle.submissions },
      {
        onSuccess: (res) => {
          const blocked = res.blockedDates.length + res.failed.length;
          if (blocked > 0) {
            toast({
              title: "Vecka delvis godkänd",
              description: `Godkände ${res.approvedCount} dag(ar). ${blocked} dag(ar) kräver åtgärd.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Vecka godkänd",
              description: `${res.approvedCount} dag(ar) godkända.`,
            });
          }
        },
        onError: (e: any) => {
          if (e instanceof NoApprovableError) {
            toast({
              title: "Inget att godkänna",
              description: e.message,
            });
          } else {
            toast({
              title: "Kunde inte godkänna vecka",
              description: e.message,
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  const openGps = (date: string) => {
    navigate(
      `/staff-management/gps-satellite-map?staffId=${encodeURIComponent(bundle.staff.id)}&date=${encodeURIComponent(date)}`,
    );
  };

  const canApproveWeek = isWeekFullyApprovable(bundle);
  const onlyPendingStaff =
    bundle.adminApprovableCount === 0 && bundle.pendingStaffAttestCount > 0;

  const approveButton = (
    <Button
      size="sm"
      className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
      disabled={!canApproveWeek || approveWeek.isPending}
      onClick={handleApproveAll}
    >
      <CheckCheck className="h-4 w-4" />
      Godkänn alla godkännbara
    </Button>
  );

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <header className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight truncate">{bundle.staff.name}</h2>
          <p className="text-xs text-muted-foreground">
            Vecka {weekNumber} · {weekRangeLabel} ·{" "}
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {formatHm(bundle.totalMinutes)}
            </span>
            {bundle.allDone && (
              <span className="ml-2 text-emerald-700 dark:text-emerald-300 font-medium">
                · Godkänd vecka
              </span>
            )}
            {onlyPendingStaff && (
              <span className="ml-2 text-indigo-700 dark:text-indigo-300 font-medium">
                · Väntar personalattest
              </span>
            )}
          </p>
        </div>
        {onlyPendingStaff ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{approveButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                Det finns inget att godkänna ännu. Dagarna väntar på personalattest.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          approveButton
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onClose}
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {bundle.days.map((d) => (
            <div key={d.date}>
              <StaffDayApprovalRow
                day={d}
                staffId={bundle.staff.id}
                isExpanded={expandedDate === d.date}
                isBusy={approveDay.isPending}
                onToggle={() => setExpandedDate(expandedDate === d.date ? null : d.date)}
                onApproveDay={() => d.submission && handleApproveDay(d.submission.id, d.date)}
                onRequestCorrection={() =>
                  d.submission && setCorrectionFor({ id: d.submission.id, date: d.date })
                }
                onOpenGps={() => openGps(d.date)}
              />
              {expandedDate === d.date && (
                <div className="space-y-2">
                  {onOpenDay && d.uiStatus !== "no_report" && (
                    <div className="px-3 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onOpenDay(d)}
                      >
                        Öppna daggranskning
                      </Button>
                    </div>
                  )}
                  <StaffDayApprovalDetails day={d} staffId={bundle.staff.id} />
                </div>
              )}
            </div>
          ))}

        </div>
      </ScrollArea>

      <Dialog open={!!correctionFor} onOpenChange={(o) => !o && setCorrectionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Begär komplettering – {correctionFor?.date}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="Förklara för personen vad som behöver kompletteras…"
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionFor(null)}>
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
    </div>
  );
};

export default StaffWeeklyApprovalPanel;
