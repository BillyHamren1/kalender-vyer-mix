import React from "react";
import { ClipboardCheck } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";

const StaffTimeApprovalsPage: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={ClipboardCheck}
        title="Tidrapport-attest"
        subtitle="Veckovis attest av personalens tidrapporter"
        variant="purple"
      />
      <StaffTimeApprovalsPageContent />
    </PageContainer>
  );
};

export default StaffTimeApprovalsPage;
