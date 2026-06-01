import React from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StaffTimeWeeklyGpsReportContent from "@/components/staff-time/StaffTimeWeeklyGpsReportContent";
import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";

// HUVUDVY: Två tabbar — "Tid" (GPS-veckomatris) och "Lön" (tidrapport-/attestvy).
// Tabbvalet speglas i URL via ?tab=tid|lon så djuplänkar fungerar.
const StaffTimeAndPayrollPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "lon" ? "lon" : "tid";

  const handleChange = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "lon") p.set("tab", "lon");
    else p.delete("tab");
    setParams(p, { replace: true });
  };

  return (
    <PageContainer theme="purple" className="p-0">
      <div className="px-4 pt-4 pb-2 border-b border-border/60 bg-gradient-to-b from-purple-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-sm">
            <CalendarClock className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Tid &amp; Lön</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              GPS-förslag → Inskickat → Attesterat. Samma data i admin och personalappen.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleChange} className="min-h-[calc(100vh-160px)]">
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="tid">Tid</TabsTrigger>
            <TabsTrigger value="lon">Lön</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tid" className="mt-2">
          <StaffTimeWeeklyGpsReportContent />
        </TabsContent>

        <TabsContent value="lon" className="mt-2">
          <StaffTimeReportsContent />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default StaffTimeAndPayrollPage;
