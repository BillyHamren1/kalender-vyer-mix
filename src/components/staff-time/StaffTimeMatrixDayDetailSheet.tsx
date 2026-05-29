/**
 * StaffTimeMatrixDayDetailSheet — drilldown från matriscell till EN dag.
 *
 * Hämtar enskild dag genom samma useStaffTimeWeekFlow(viewer='admin') som
 * resten av Tid & Lön (= samma rader, samma status, samma normal/övertid).
 * Render via WeekFlowDayCard så att matrisen och WeekFlow delar 100% UI.
 */
import { parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { useStaffTimeWeekFlow } from "@/hooks/staffTimeFlow/useStaffTimeWeekFlow";
import WeekFlowDayCard from "@/components/staff-time/week-flow/WeekFlowDayCard";

interface Props {
  open: { staffId: string; date: string } | null;
  onClose: () => void;
}

export default function StaffTimeMatrixDayDetailSheet({ open, onClose }: Props) {
  const navigate = useNavigate();
  const staffId = open?.staffId ?? null;
  const date = open?.date ?? null;
  const weekDates = date ? [parseISO(date)] : [];

  const { flow, isLoading } = useStaffTimeWeekFlow({
    staffId,
    weekDates,
    viewer: "admin",
  });

  const day = flow?.days[0] ?? null;
  const isOpen = !!open;

  return (
    <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[460px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{date ? `Dag ${date}` : "Dag"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laddar…
            </div>
          )}
          {day && (
            <WeekFlowDayCard
              day={day}
              onOpenGps={(d) => {
                if (staffId) {
                  navigate(`/staff-management/gps-satellite-map?staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(d)}`);
                }
              }}
            />
          )}
          {!isLoading && !day && (
            <div className="text-sm text-muted-foreground">Ingen data för dagen.</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
