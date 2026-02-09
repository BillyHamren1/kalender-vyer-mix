import React from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Truck, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { useVehicles } from '@/hooks/useVehicles';
import { useNavigate } from 'react-router-dom';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import DashboardJobMap from '@/components/dashboard/DashboardJobMap';

const LogisticsPlanning: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles } = useVehicles();

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Truck}
        title="Transport"
        subtitle={`Vecka ${format(new Date(), 'w', { locale: sv })}`}
      >
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/vehicles')}
          className="rounded-xl"
        >
          <Truck className="h-4 w-4 mr-2" />
          Fordon & Partners
        </Button>
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/routes')}
          className="rounded-xl"
        >
          <Route className="h-4 w-4 mr-2" />
          Rutter
        </Button>
      </PageHeader>

      {/* Job Map - full width */}
      <div className="mb-4">
        <DashboardJobMap />
      </div>

      {/* Weekly calendar */}
      <LogisticsWeekView />

      {/* Transport Booking - 3 columns */}
      <TransportBookingTab vehicles={vehicles} />
    </PageContainer>
  );
};

export default LogisticsPlanning;
