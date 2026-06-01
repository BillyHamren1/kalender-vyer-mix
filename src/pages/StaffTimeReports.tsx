import { Clock } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import StaffTimeReportsContent from '@/components/staff-time/StaffTimeReportsContent';

// Bryt ut typer (importeras av andra komponenter)
export type {
  SegmentKind,
  DaySegment,
  LatestPing,
  PresenceDebug,
  PlanningStatus,
  ProjectInfo,
  StaffWithDayReport,
} from './StaffTimeReports.types';

const StaffTimeReports = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader title="Tidrapporter" icon={Clock} variant="purple" />
      <StaffTimeReportsContent />
    </PageContainer>
  );
};

export default StaffTimeReports;
