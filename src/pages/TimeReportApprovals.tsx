
import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import TimeReportApprovalPanel from '@/components/staff/TimeReportApprovalPanel';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';

const TimeReportApprovals = () => {
  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardCheck}
        title="Tidrapportsgodkännanden"
        subtitle="Granska och godkänn inrapporterade timmar från personalen"
      />
      <TimeReportApprovalPanel />
    </PageContainer>
  );
};

export default TimeReportApprovals;
