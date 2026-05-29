import React from "react";
import { CalendarClock } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import StaffTimeWeeklyGpsReportContent from "@/components/staff-time/StaffTimeWeeklyGpsReportContent";

// HUVUDVY: Ett enda enkelt flöde — GPS-förslag → Inskickat → Attesterat.
// Gamla attest/rapport/löne-vyer har medvetet tagits bort från denna sida
// (komponenterna finns kvar i kodbasen men importeras/renderas inte här).
const StaffTimeAndPayrollPage: React.FC = () => {
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

      <div className="min-h-[calc(100vh-160px)]">
        <StaffTimeWeeklyGpsReportContent />
      </div>
    </PageContainer>
  );
};

export default StaffTimeAndPayrollPage;
