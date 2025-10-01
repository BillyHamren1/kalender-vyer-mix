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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-8 py-4 rounded-lg shadow-2xl border-2 border-primary-foreground/20 flex items-center gap-4 animate-in slide-in-from-top">
      <div className="flex-1">
        <div className="font-bold text-lg mb-1">{markedEvent.title}</div>
        <div className="text-sm font-medium">
          {!timeSelection.startTime && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
              Click a time on the LEFT to set START time
            </div>
          )}
          {timeSelection.startTime && !timeSelection.endTime && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
              Start: {format(timeSelection.startTime, 'HH:mm')} → Now click END time
            </div>
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
