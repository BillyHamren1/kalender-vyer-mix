import { useState } from 'react';
import { useProjectStaff } from '@/hooks/useProjectStaff';
import { PlannedStaffSection } from './PlannedStaffSection';
import { StaffTimeReportsSection } from './StaffTimeReportsSection';
import { LaborCostsSection } from './LaborCostsSection';
import { StaffSummaryCard } from './StaffSummaryCard';
import { AddLaborCostDialog } from './AddLaborCostDialog';
import { AddTimeReportDialog } from './AddTimeReportDialog';

interface ProjectStaffTabProps {
  projectId: string;
  bookingId: string | null;
}

export const ProjectStaffTab = ({ projectId, bookingId }: ProjectStaffTabProps) => {
  const [showLaborCostDialog, setShowLaborCostDialog] = useState(false);
  const [showTimeReportDialog, setShowTimeReportDialog] = useState(false);

  const {
    plannedStaff,
    timeReports,
    laborCosts,
    summary,
    isLoading,
    addLaborCost,
    removeLaborCost,
    addTimeReport,
    removeTimeReport
  } = useProjectStaff(projectId, bookingId);

  return (
    <div className="space-y-6">
      <PlannedStaffSection staff={plannedStaff} isLoading={isLoading} />
      
      <StaffTimeReportsSection
        reports={timeReports}
        isLoading={isLoading}
        onAddReport={() => setShowTimeReportDialog(true)}
        onDeleteReport={removeTimeReport}
      />
      
      <LaborCostsSection
        costs={laborCosts}
        isLoading={isLoading}
        onAddCost={() => setShowLaborCostDialog(true)}
        onDeleteCost={removeLaborCost}
      />
      
      <StaffSummaryCard summary={summary} />

      <AddLaborCostDialog
        open={showLaborCostDialog}
        onOpenChange={setShowLaborCostDialog}
        projectId={projectId}
        plannedStaff={plannedStaff}
        onSubmit={addLaborCost}
      />

      {bookingId && (
        <AddTimeReportDialog
          open={showTimeReportDialog}
          onOpenChange={setShowTimeReportDialog}
          bookingId={bookingId}
          plannedStaff={plannedStaff}
          onSubmit={addTimeReport}
        />
      )}
    </div>
  );
};
