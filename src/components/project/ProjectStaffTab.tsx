import { useState } from 'react';
import { useProjectStaff } from '@/hooks/useProjectStaff';
import { PlannedStaffSection } from './PlannedStaffSection';
import { StaffTimeReportsSection } from './StaffTimeReportsSection';
import { LaborCostsSection } from './LaborCostsSection';
import { StaffSummaryCard } from './StaffSummaryCard';
import { AddLaborCostDialog } from './AddLaborCostDialog';
import { AddTimeReportDialog } from './AddTimeReportDialog';
import { LocationTimeSection } from './LocationTimeSection';
import { ProjectAutoTimeSection } from './ProjectAutoTimeSection';

interface ProjectStaffTabProps {
  projectId: string;
  bookingId: string | null;
  largeProjectId?: string | null;
  isInternal?: boolean;
  locationId?: string | null;
}

export const ProjectStaffTab = ({ projectId, bookingId, largeProjectId, isInternal, locationId }: ProjectStaffTabProps) => {
  // For internal projects, show location time instead
  if (isInternal && locationId) {
    return <LocationTimeSection locationId={locationId} />;
  }

  return <ProjectStaffTabInner projectId={projectId} bookingId={bookingId} largeProjectId={largeProjectId} />;
};

const ProjectStaffTabInner = ({ projectId, bookingId, largeProjectId }: { projectId: string; bookingId: string | null; largeProjectId?: string | null }) => {
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
  } = useProjectStaff(projectId, { bookingId, largeProjectId });

  const projectTarget = largeProjectId
    ? { kind: 'large_project' as const, largeProjectId }
    : bookingId
      ? { kind: 'booking' as const, bookingId }
      : null;

  return (
    <div className="space-y-6">
      <PlannedStaffSection staff={plannedStaff} isLoading={isLoading} />

      {projectTarget && (
        <ProjectAutoTimeSection
          target={
            largeProjectId
              ? { kind: 'large_project', largeProjectId }
              : { kind: 'booking', bookingId: bookingId! }
          }
          plannedStaff={plannedStaff}
        />
      )}


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

      {projectTarget && (
        <AddTimeReportDialog
          open={showTimeReportDialog}
          onOpenChange={setShowTimeReportDialog}
          target={
            largeProjectId
              ? { large_project_id: largeProjectId }
              : { booking_id: bookingId ?? undefined }
          }
          plannedStaff={plannedStaff}
          onSubmit={addTimeReport}
        />
      )}
    </div>
  );
};
