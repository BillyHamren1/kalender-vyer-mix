import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import AddRiggDayDialog from './AddRiggDayDialog';
import type { CalendarEvent } from './ResourceData';

interface Props {
  event: CalendarEvent;
  onUpdate?: () => void;
}

/**
 * "+"-knapp i nedre vänstra hörnet av eventet — öppnar AddRiggDayDialog
 * för att lägga till en extra rigg-/event-/demonteringsdag på samma booking.
 */
export const AddDayButton: React.FC<Props> = ({ event, onUpdate }) => {
  const [open, setOpen] = useState(false);

  const startTime = event.start?.includes('T')
    ? event.start.split('T')[1]?.slice(0, 5) || '08:00'
    : '08:00';
  const endTime = event.end?.includes('T')
    ? event.end.split('T')[1]?.slice(0, 5) || '17:00'
    : '17:00';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute bottom-0.5 left-0.5 p-0.5 rounded bg-white/70 hover:bg-primary/20 z-20"
        title="Lägg till dag"
      >
        <Plus className="h-3 w-3 text-primary" />
      </button>
      <AddRiggDayDialog
        open={open}
        onOpenChange={setOpen}
        event={{
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          bookingId: event.bookingId,
          resourceId: event.resourceId,
          eventType: event.eventType,
        }}
        defaultStartTime={startTime}
        defaultEndTime={endTime}
        onUpdate={onUpdate}
      />
    </>
  );
};
