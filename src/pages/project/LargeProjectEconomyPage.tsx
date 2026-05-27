import { useOutletContext } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, BarChart3, TrendingDown, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useLargeProjectEconomy } from "@/hooks/useLargeProjectEconomy";
import { useLargeProjectCostLines } from "@/hooks/useLargeProjectCostLines";
import { LargeProjectBookingEconomyBreakdown } from "@/components/project/LargeProjectBookingEconomyBreakdown";
import { LargeProjectEditableCostList } from "@/components/project/LargeProjectEditableCostList";
import { ProjectDailyStaffTimeOverview } from "@/components/project/ProjectDailyStaffTimeOverview";

const fmt = (v: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(v);

const LargeProjectEconomyPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const bookings = project?.bookings || [];
  const bookingIds = bookings.map((b) => b.booking_id);

  const {
    summary, isLoading, bookingEconomyData, localProducts, timeReportsByBooking,
  } = useLargeProjectEconomy(project?.id, bookingIds);

  const {
    lines, isLoading: linesLoading, addLine, updateLine, removeLine,
  } = useLargeProjectCostLines(project?.id);

  const [costBreakdownOpen, setCostBreakdownOpen] = useState(false);

  if (!project) return null;

  if (isLoading || linesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // Real total cost = manual lines + reported time (assembly auto)
  const reportedTimeTotal = Object.values(timeReportsByBooking).reduce((s, reps) =>
    s + reps.reduce((ss, r: any) => ss + (Number(r.total_cost) || 0), 0), 0);
  const linesTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const realTotalCost = linesTotal + reportedTimeTotal;

  const margin = summary.grandTotalRevenue > 0
    ? ((summary.grandTotalRevenue - realTotalCost) / summary.grandTotalRevenue) * 100
    : 0;
  const marginAmount = summary.grandTotalRevenue - realTotalCost;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt (bokningar)</p>
            </div>
            <p className="text-xl font-bold text-foreground">{fmt(summary.grandTotalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.bookingCount} bokningar</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total kostnad</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setCostBreakdownOpen(!costBreakdownOpen)}
              >
                {costBreakdownOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xl font-bold text-foreground">{fmt(realTotalCost)}</p>
            {costBreakdownOpen && (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                <div className="flex justify-between text-xs"><span>Manuella kostnadsrader</span><span className="font-medium">{fmt(linesTotal)}</span></div>
                <div className="flex justify-between text-xs"><span>Rapporterad arbetstid</span><span className="font-medium">{fmt(reportedTimeTotal)}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={cn("border-border/40", margin < 0 && "border-red-200/60 dark:border-red-800/40")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB / Marginal</p>
            </div>
            <p className={cn("text-xl font-bold", margin >= 20 ? "text-green-600" : margin >= 0 ? "text-amber-600" : "text-red-600")}>
              {fmt(marginAmount)} ({margin.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Editable unified cost list */}
      <LargeProjectEditableCostList
        largeProjectId={project.id}
        lines={lines}
        bookingEconomyData={bookingEconomyData}
        timeReportsByBooking={timeReportsByBooking}
        localProducts={localProducts}
        addLine={addLine}
        updateLine={updateLine}
        removeLine={removeLine}
      />

      {/* Detailed per-booking economy breakdown (referensdata från bokningssystemet) */}
      {bookingEconomyData && summary.bookingCount > 0 && (
        <LargeProjectBookingEconomyBreakdown
          bookingEconomyData={bookingEconomyData}
          bookings={bookings}
          largeProjectId={project.id}
          localProducts={localProducts}
        />
      )}
    </div>
  );
};

export default LargeProjectEconomyPage;
