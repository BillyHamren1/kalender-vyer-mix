import React, { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Truck, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { useVehicles } from '@/hooks/useVehicles';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import LogisticsMapWidget from '@/components/logistics/widgets/LogisticsMapWidget';
import LogisticsCalendarWidget from '@/components/logistics/widgets/LogisticsCalendarWidget';
import LogisticsTrafficWidget from '@/components/logistics/widgets/LogisticsTrafficWidget';
import LogisticsWeatherWidget from '@/components/logistics/widgets/LogisticsWeatherWidget';
import LogisticsTransportWidget from '@/components/logistics/widgets/LogisticsTransportWidget';
import DashboardJobMap from '@/components/dashboard/DashboardJobMap';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';

type ExpandedWidget = 'map' | 'calendar' | 'transport' | null;

const LogisticsPlanning: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles } = useVehicles();
  const [expanded, setExpanded] = useState<ExpandedWidget>(null);

  return (
    <PageContainer>
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

      {/* Widget grid: Map left, 3 widgets stacked right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 mb-6">
        {/* Map - spans full height of right column */}
        <LogisticsMapWidget onClick={() => setExpanded('map')} />
        
        {/* Right column: Calendar + Weather + Traffic stacked */}
        <div className="flex flex-col gap-4">
          <LogisticsCalendarWidget onClick={() => setExpanded('calendar')} />
          <LogisticsWeatherWidget />
          <LogisticsTrafficWidget />
        </div>
      </div>

      {/* Transport booking widget - full width */}
      <LogisticsTransportWidget onClick={() => setExpanded('transport')} vehicles={vehicles} />

      {/* Expanded map dialog */}
      <Dialog open={expanded === 'map'} onOpenChange={open => !open && setExpanded(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[85vh] p-0 bg-card overflow-hidden">
          <div className="h-full">
            <DashboardJobMap />
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded calendar dialog */}
      <Dialog open={expanded === 'calendar'} onOpenChange={open => !open && setExpanded(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[85vh] p-4 bg-card overflow-auto">
          <LogisticsWeekView />
        </DialogContent>
      </Dialog>

      {/* Expanded transport dialog */}
      <Dialog open={expanded === 'transport'} onOpenChange={open => !open && setExpanded(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[85vh] p-4 bg-card overflow-auto">
          <TransportBookingTab vehicles={vehicles} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default LogisticsPlanning;
