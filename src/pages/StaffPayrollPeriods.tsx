import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { PayrollPeriodSelector } from "@/components/staff/PayrollPeriodSelector";
import { PayrollPeriodReportTable } from "@/components/staff/PayrollPeriodReportTable";

export default function StaffPayrollPeriods() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarRange}
        title="Löneperioder"
        subtitle="Skapa löneperioder och se all personals inrapporterade tid i perioden. Detta är underlag – inte slutgiltig löneexport."
      />
      <div className="space-y-4">
        <PayrollPeriodSelector selectedId={selectedId} onSelect={setSelectedId} />
        <PayrollPeriodReportTable periodId={selectedId} />
      </div>
    </PageContainer>
  );
}
