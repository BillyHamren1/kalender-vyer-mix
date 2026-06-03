/**
 * StaffTimeApprovalsPageContent — Lön-tabben.
 *
 * Ren tidrapport för ekonomiavdelningen: ett "papper" per anställd, samma
 * underliggande block som Tid-tabben (useStaffTimeWeekMatrix), exporterbar
 * till CSV och utskrivbar till PDF via browser-print.
 *
 * Den tidigare kliniska veckomatrisen (StaffPayrollWeekMatrix*) är borttagen
 * — den såg ut som ett internt admin-verktyg, inte en lönerapport.
 */
import React from "react";
import StaffPayrollReport from "./StaffPayrollReport";

export const StaffTimeApprovalsPageContent: React.FC = () => {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <StaffPayrollReport />
    </div>
  );
};

export default StaffTimeApprovalsPageContent;
