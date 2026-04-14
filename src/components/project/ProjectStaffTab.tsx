import { useState } from 'react';
import { useProjectStaff } from '@/hooks/useProjectStaff';
import { PlannedStaffSection } from './PlannedStaffSection';
import { StaffTimeReportsSection } from './StaffTimeReportsSection';
import { LaborCostsSection } from './LaborCostsSection';
import { StaffSummaryCard } from './StaffSummaryCard';
import { AddLaborCostDialog } from './AddLaborCostDialog';
import { AddTimeReportDialog } from './AddTimeReportDialog';
import { LocationTimeSection } from './LocationTimeSection';

interface ProjectStaffTabProps {
  projectId: string;
  bookingId: string | null;
  isInternal?: boolean;
  locationId?: string | null;
}

export const ProjectStaffTab = ({ projectId, bookingId, isInternal, locationId }: ProjectStaffTabProps) => {
  // For internal projects, show location time instead
  if (isInternal && locationId) {
    return <LocationTimeSection locationId={locationId} />;
  }

  return <ProjectStaffTabInner projectId={projectId} bookingId={bookingId} />;
};

const ProjectStaffTabInner = ({ projectId, bookingId }: { projectId: string; bookingId: string | null }) => {
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
