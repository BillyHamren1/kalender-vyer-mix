import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useStaffDashboard } from '@/hooks/useStaffDashboard';
import StaffMapView from '@/components/staff-dashboard/StaffMapView';
import JobActivityFeed from '@/components/staff-dashboard/JobActivityFeed';

const StaffDashboard = () => {
  const { activity, isLoadingActivity, locations, isLoadingLocations } = useStaffDashboard();

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] p-4 gap-4 theme-purple">
<PageHeader
        icon={Users}
        title="Personalöversikt"
        subtitle="Aktivitet och positioner"
        variant="purple"
        className="shrink-0"
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 min-h-0">
        {/* Center: Map */}
        <div className="min-h-[400px] lg:min-h-0">
          <StaffMapView locations={locations} isLoading={isLoadingLocations} />
        </div>

        {/* Right: Activity */}
        <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-100px)]">
          <JobActivityFeed activity={activity} isLoading={isLoadingActivity} />
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
