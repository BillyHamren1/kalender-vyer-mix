import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  Wallet,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";
import PayrollMonthReportPageContent from "@/components/staff-payroll-month/PayrollMonthReportPageContent";
import StaffTimeReportsContent from "@/components/staff-time/StaffTimeReportsContent";
import StaffPayrollPeriodsContent from "@/components/staff-time/StaffPayrollPeriodsContent";
import TimePayrollOverview from "@/components/staff-time/TimePayrollOverview";

type TabKey = "overview" | "reports" | "approvals" | "payroll";
const VALID: TabKey[] = ["overview", "reports", "approvals", "payroll"];

const StaffTimeAndPayrollPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = useMemo(
    () => (VALID.includes(raw as TabKey) ? (raw as TabKey) : "approvals"),
    [raw],
  );

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <PageContainer theme="purple" className="p-0">
      {/* Premium compact header */}
      <div className="px-4 pt-4 pb-2 border-b border-border/60 bg-gradient-to-b from-purple-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-sm">
            <CalendarClock className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Tid &amp; Lön</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              Tidrapporter, attest och löneunderlag – samlat på ett ställe.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-800 px-3 h-8">
              <LayoutDashboard className="h-3.5 w-3.5" /> Översikt
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-800 px-3 h-8">
              <Clock className="h-3.5 w-3.5" /> Rapporter
            </TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-800 px-3 h-8">
              <ClipboardCheck className="h-3.5 w-3.5" /> Attest
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-800 px-3 h-8">
              <Wallet className="h-3.5 w-3.5" /> Lön
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <div className="min-h-[calc(100vh-160px)]">
        {tab === "overview" && (
          <div className="p-4">
            <TimePayrollOverview onNavigateTab={setTab} />
          </div>
        )}

        {tab === "reports" && (
          <div className="p-0">
            <StaffTimeReportsContent />
          </div>
        )}

        {tab === "approvals" && (
          <div className="p-0">
            <StaffTimeApprovalsPageContent />
          </div>
        )}

        {tab === "payroll" && (
          <div className="p-4">
            <PayrollSubTabs />
          </div>
        )}
      </div>
    </PageContainer>
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
