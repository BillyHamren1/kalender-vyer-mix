import { Clock } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StaffListTab from '@/components/staff-time-reports/StaffListTab';
import PendingApprovalsTab from '@/components/staff-time-reports/PendingApprovalsTab';

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

      <Tabs defaultValue="staff" className="mt-4">
        <TabsList>
          <TabsTrigger value="staff">Personal</TabsTrigger>
          <TabsTrigger value="pending">Att attestera</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <StaffListTab />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingApprovalsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default StaffTimeReports;
