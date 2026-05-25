import React from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import PayrollMonthReportPageContent from "@/components/staff-payroll-month/PayrollMonthReportPageContent";

const StaffPayrollMonthReport: React.FC = () => {
  return (
    <PageContainer theme="purple" className="p-0">
      <PayrollMonthReportPageContent />
    </PageContainer>
  );
};

export default StaffPayrollMonthReport;
