import { ClipboardCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffDayReportsList } from "@/components/staff/StaffDayReportsList";

export default function StaffDayReportsAdmin() {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={ClipboardCheck}
        variant="purple"
        title="Inskickade dagrapporter"
        subtitle="Granska personalens inskickade dagrapporter – godkänn för OK eller markera för kontroll."
      />
      <StaffDayReportsList />
    </PageContainer>
  );
}
