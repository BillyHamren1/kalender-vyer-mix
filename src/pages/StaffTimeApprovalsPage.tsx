import React from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import StaffTimeApprovalsPageContent from "@/components/staff-time-approvals/StaffTimeApprovalsPageContent";

const StaffTimeApprovalsPage: React.FC = () => {
  return (
    <PageContainer theme="purple" className="p-0">
      <StaffTimeApprovalsPageContent />
    </PageContainer>
  );
};

export default StaffTimeApprovalsPage;
