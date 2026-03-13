import { useStaffDashboard } from '@/hooks/useStaffDashboard';
import StaffMapView from '@/components/staff-dashboard/StaffMapView';
import MessagesFeed from '@/components/staff-dashboard/MessagesFeed';
import JobActivityFeed from '@/components/staff-dashboard/JobActivityFeed';

const StaffDashboard = () => {
  const { messages, isLoadingMessages, activity, isLoadingActivity, locations, isLoadingLocations } = useStaffDashboard();

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <h1 className="text-lg font-bold text-foreground">Personalöversikt</h1>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 min-h-0">
        {/* Left: Messages */}
        <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-120px)]">
          <MessagesFeed messages={messages} isLoading={isLoadingMessages} />
        </div>

        {/* Center: Map */}
        <div className="min-h-[400px] lg:min-h-0">
          <StaffMapView locations={locations} isLoading={isLoadingLocations} />
        </div>

        {/* Right: Activity */}
        <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-120px)]">
          <JobActivityFeed activity={activity} isLoading={isLoadingActivity} />
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
