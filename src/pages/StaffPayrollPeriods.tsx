import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, FileText } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PayrollPeriodSelector } from "@/components/staff/PayrollPeriodSelector";
import { PayrollPeriodReportTable } from "@/components/staff/PayrollPeriodReportTable";

export default function StaffPayrollPeriods() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={CalendarRange}
        variant="purple"
        title="Löneperioder"
        subtitle="Lås och godkänn period för utbetalning. Detta är underlag – inte slutgiltig löneexport."
      />

      <Card className="mb-4 p-3 flex flex-wrap items-center gap-3 border-purple-500/20 bg-purple-500/5">
        <FileText className="h-4 w-4 text-purple-600 shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Vill du se månadsrapport baserad på godkänd tid?</div>
          <div className="text-xs text-muted-foreground">
            Färdigt underlag av godkänd tid per personal – klart att mejla.
          </div>
        </div>
        <Button asChild size="sm" className="ml-auto gap-1.5">
          <Link to="/staff-management/payroll-month-report">
            <FileText className="h-3.5 w-3.5" />
            Öppna månadsrapport lön
          </Link>
        </Button>
      </Card>

      <div className="space-y-4">
        <PayrollPeriodSelector selectedId={selectedId} onSelect={setSelectedId} />
        <PayrollPeriodReportTable periodId={selectedId} />
      </div>
    </PageContainer>
  );
}
