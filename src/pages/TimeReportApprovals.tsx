
import React from 'react';
import TimeReportApprovalPanel from '@/components/staff/TimeReportApprovalPanel';

const TimeReportApprovals = () => {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Tidrapportsgodkännanden</h1>
        <p className="text-muted-foreground mt-1">
          Granska och godkänn inrapporterade timmar från personalen
        </p>
      </div>
      
      <TimeReportApprovalPanel />
    </div>
  );
};

export default TimeReportApprovals;
