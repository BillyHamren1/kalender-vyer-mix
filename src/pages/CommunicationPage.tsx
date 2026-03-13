import { useStaffDashboard } from '@/hooks/useStaffDashboard';
import MessagesFeed from '@/components/staff-dashboard/MessagesFeed';

const CommunicationPage = () => {
  const { messages, isLoadingMessages } = useStaffDashboard();

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] p-4 gap-4">
      <h1 className="text-lg font-bold text-foreground shrink-0">Kommunikation</h1>
      <div className="flex-1 min-h-0 max-w-3xl w-full mx-auto">
        <MessagesFeed messages={messages} isLoading={isLoadingMessages} />
      </div>
    </div>
  );
};

export default CommunicationPage;
