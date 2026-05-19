import { ClipboardCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffDayReportsList } from "@/components/staff/StaffDayReportsList";

export default function StaffDayReportsAdmin() {
  return (
    <PageContainer>
      <PageHeader
        icon={<ClipboardCheck className="h-6 w-6" />}
        title="Inskickade dagrapporter"
        description="Granska personalens inskickade dagrapporter – godkänn för OK eller markera för kontroll."
      />
      <StaffDayReportsList />
    </PageContainer>
  );
}
