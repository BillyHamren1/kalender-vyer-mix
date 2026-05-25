import React, { useState } from "react";
import { PayrollPeriodSelector } from "@/components/staff/PayrollPeriodSelector";
import { PayrollPeriodReportTable } from "@/components/staff/PayrollPeriodReportTable";

/**
 * Embedded version av StaffPayrollPeriods – utan egen PageHeader,
 * avsedd för Tid & Lön-modulens Lön-tab.
 */
const StaffPayrollPeriodsContent: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Löneperioder</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Lås och godkänn period för utbetalning. Detta är underlag – inte slutgiltig löneexport.
        </p>
      </div>
      <PayrollPeriodSelector selectedId={selectedId} onSelect={setSelectedId} />
      <PayrollPeriodReportTable periodId={selectedId} />
    </div>
  );
};

export default StaffPayrollPeriodsContent;
