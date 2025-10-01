import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface MarkedEventOverlayProps {
  markedEvent: {
    id: string;
    title: string;
    originalStart: Date;
    originalEnd: Date;
  };
  timeSelection: {
    startTime: Date | null;
    endTime: Date | null;
  };
  onCancel: () => void;
}

const MarkedEventOverlay: React.FC<MarkedEventOverlayProps> = ({
  markedEvent,
  timeSelection,
  onCancel
}) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-6 py-3 rounded-lg shadow-lg border border-border flex items-center gap-4 animate-in slide-in-from-top">
      <div className="flex-1">
        <div className="font-semibold">{markedEvent.title}</div>
        <div className="text-sm opacity-90">
          {!timeSelection.startTime && "Click a time slot to set start time"}
          {timeSelection.startTime && !timeSelection.endTime && (
            <>
              Start: {format(timeSelection.startTime, 'HH:mm')} - Click to set end time
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default MarkedEventOverlay;
