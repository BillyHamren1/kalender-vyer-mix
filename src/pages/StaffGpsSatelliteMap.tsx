import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Satellite } from 'lucide-react';
import StaffGpsSatelliteMap from '@/components/staff/StaffGpsSatelliteMap';

export default function StaffGpsSatelliteMapPage() {
  const [params] = useSearchParams();
  const staffId = params.get('staffId');
  const date = params.get('date');
  return (
    <PageContainer>
      <PageHeader
        title="GPS satellitkarta"
        description="Rådata från staff_location_history. Ingen filtrering, ingen tolkning."
        icon={<Satellite className="h-5 w-5" />}
      />
      <StaffGpsSatelliteMap initialStaffId={staffId} initialDate={date} />
    </PageContainer>
  );
}
