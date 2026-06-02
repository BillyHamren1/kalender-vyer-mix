/**
 * StaffTimeApprovalsPageContent — innehåll för "Lön"-tabben.
 *
 * Visar samma block per dag som Tid-tabben (källa: useStaffTimeWeekMatrix)
 * men i en klinisk, strukturerad veckomatris fokuserad på löneattest.
 *
 * Den tidigare bundle-listan (StaffWeeklyApprovalList / Sheet-panelen) är
 * borttagen från Lön — granskning sker via cell → dag-snabbvy → ev.
 * GPS-satellitkarta, exakt som i Tid-tabben.
 */
import React from "react";
import StaffPayrollWeekMatrix from "./StaffPayrollWeekMatrix";

export const StaffTimeApprovalsPageContent: React.FC = () => {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <StaffPayrollWeekMatrix />
    </div>
  );
};

export default StaffTimeApprovalsPageContent;
