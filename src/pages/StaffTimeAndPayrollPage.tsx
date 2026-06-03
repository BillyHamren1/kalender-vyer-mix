import React from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, RefreshCw, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { PageContainer } from "@/components/ui/PageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import StaffTimeWeeklyGpsReportContent from "@/components/staff-time/StaffTimeWeeklyGpsReportContent";
import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";

// HUVUDVY: Två tabbar — "Tid" (GPS-veckomatris) och "Lön" (tidrapport-/attestvy).
// Tabbvalet speglas i URL via ?tab=tid|lon så djuplänkar fungerar.
const StaffTimeAndPayrollPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tab = params.get("tab") === "lon" ? "lon" : "tid";
  const [lastRefresh, setLastRefresh] = React.useState<Date>(() => new Date());

  const handleChange = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "lon") p.set("tab", "lon");
    else p.delete("tab");
    setParams(p, { replace: true });
  };

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["staff-time-week-matrix"] });
    qc.invalidateQueries({ queryKey: ["staff-time-flow-submissions"] });
    qc.invalidateQueries({ queryKey: ["staff-time-matrix-subs"] });
    setLastRefresh(new Date());
  };

  return (
    <PageContainer theme="purple" className="p-0">
      {/* Premium page header */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent">
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
            <CalendarClock className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-foreground">
              Tid &amp; Lön
            </h1>
            <p className="text-[12.5px] text-muted-foreground leading-snug mt-0.5">
              GPS-förslag → Inskickat → Attesterat. Samma data i admin och personalappen.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground leading-none">
                Senast uppdaterad
              </span>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                idag {format(lastRefresh, "HH:mm")}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Uppdatera
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs hidden sm:inline-flex"
              disabled
              title="Export hanteras från Lön-fliken"
            >
              <Download className="h-3.5 w-3.5" />
              Rapport
            </Button>
          </div>
        </div>
      </div>

      {/* Premium tabs */}
      <Tabs value={tab} onValueChange={handleChange} className="min-h-[calc(100vh-200px)]">
        <div className="px-4">
          <TabsList className="h-11 bg-muted/60 p-1 rounded-xl border border-border/60 shadow-sm">
            <TabsTrigger
              value="tid"
              className="h-9 px-5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 rounded-lg transition-colors"
            >
              Tid
            </TabsTrigger>
            <TabsTrigger
              value="lon"
              className="h-9 px-5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-violet-700 rounded-lg transition-colors"
            >
              Lön
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tid" className="mt-1">
          <StaffTimeWeeklyGpsReportContent />
        </TabsContent>

        <TabsContent value="lon" className="mt-2">
          <StaffTimeApprovalsPageContent />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default StaffTimeAndPayrollPage;
