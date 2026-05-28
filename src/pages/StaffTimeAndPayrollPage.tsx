import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

import StaffTimeWeeklyGpsReportContent from "@/components/staff-time/StaffTimeWeeklyGpsReportContent";
import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";
import PayrollMonthReportPageContent from "@/components/staff-payroll-month/PayrollMonthReportPageContent";
import StaffTimeReportsContent from "@/components/staff-time/StaffTimeReportsContent";
import StaffPayrollPeriodsContent from "@/components/staff-time/StaffPayrollPeriodsContent";
import TimePayrollOverview from "@/components/staff-time/TimePayrollOverview";

// HUVUDVY: Den enkla flow-vyn (GPS → submitted → approved). Inga andra tabbar
// dominerar längre — gamla attest/rapport/lönesidor finns kvar under
// "Avancerat ▾" för bakåtkompatibilitet (per .lovable/plan.md krav K).
const StaffTimeAndPayrollPage: React.FC = () => {
  const [params] = useSearchParams();
  const showAdvanced = params.get("advanced") === "1";
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(showAdvanced);

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
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Avancerat {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div className="min-h-[calc(100vh-160px)]">
        <StaffTimeWeeklyGpsReportContent />
      </div>

      {advancedOpen && <AdvancedLegacySection />}
    </PageContainer>
  );
};

// Legacy: gamla attest/rapport/löne-tabbar bakom diskret Avancerat-meny.
const AdvancedLegacySection: React.FC = () => {
  return (
    <div className="border-t bg-muted/30 px-4 py-4">
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wider">
        Avancerat (legacy-vyer)
      </div>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="reports">Rapporter</TabsTrigger>
          <TabsTrigger value="approvals">Gamla attest-vyn</TabsTrigger>
          <TabsTrigger value="payroll">Lön</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-3">
          <TimePayrollOverview onNavigateTab={() => {}} />
        </TabsContent>
        <TabsContent value="reports" className="mt-3">
          <StaffTimeReportsContent />
        </TabsContent>
        <TabsContent value="approvals" className="mt-3">
          <StaffTimeApprovalsPageContent />
        </TabsContent>
        <TabsContent value="payroll" className="mt-3">
          <PayrollSubTabs />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const PayrollSubTabs: React.FC = () => {
  return (
    <Tabs defaultValue="month" className="w-full">
      <TabsList>
        <TabsTrigger value="month">Månadsrapport</TabsTrigger>
        <TabsTrigger value="periods">Löneperioder</TabsTrigger>
      </TabsList>
      <TabsContent value="month" className="mt-3">
        <Card className="overflow-hidden">
          <PayrollMonthReportPageContent embedded />
        </Card>
      </TabsContent>
      <TabsContent value="periods" className="mt-3">
        <Card className="overflow-hidden">
          <StaffPayrollPeriodsContent />
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default StaffTimeAndPayrollPage;
