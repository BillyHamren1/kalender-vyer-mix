import { useStaffDashboard } from '@/hooks/useStaffDashboard';
import StaffMapView from '@/components/staff-dashboard/StaffMapView';
import MessagesFeed from '@/components/staff-dashboard/MessagesFeed';
import JobActivityFeed from '@/components/staff-dashboard/JobActivityFeed';

const StaffDashboard = () => {
  const { messages, isLoadingMessages, activity, isLoadingActivity, locations, isLoadingLocations } = useStaffDashboard();

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] p-4 gap-4">
      <h1 className="text-lg font-bold text-foreground shrink-0">Personalöversikt</h1>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_280px] gap-4 min-h-0">
        {/* Left: Chat */}
        <div className="min-h-0 lg:h-[calc(100vh-100px)]">
          <MessagesFeed messages={messages} isLoading={isLoadingMessages} />
        </div>

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
