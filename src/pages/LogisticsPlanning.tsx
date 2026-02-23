import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useVehicles } from '@/hooks/useVehicles';
import LogisticsTransportWidget from '@/components/logistics/widgets/LogisticsTransportWidget';
import LogisticsWeekView from '@/components/logistics/LogisticsWeekView';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';

type ExpandedWidget = 'transport' | null;

const LogisticsPlanning: React.FC = () => {
  const { vehicles } = useVehicles();
  const [expanded, setExpanded] = useState<ExpandedWidget>(null);

  return (
    <div>
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
    </div>
  );
};

export default LogisticsPlanning;
