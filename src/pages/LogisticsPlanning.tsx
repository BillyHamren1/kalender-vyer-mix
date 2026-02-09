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
import LogisticsTransportWidget from '@/components/logistics/widgets/LogisticsTransportWidget';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';

type ExpandedWidget = 'transport' | null;

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

      {/* Week calendar view */}
      <div className="mb-6">
        <LogisticsWeekView />
      </div>

      {/* Transport booking widget */}
      <div className="mb-6">
        <LogisticsTransportWidget
          onClick={() => setExpanded('transport')}
          vehicles={vehicles}
        />
      </div>

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
