
import React from 'react';
import { AddDateButton } from './AddDateButton';
import { DateBadge } from './DateBadge';
import { CalendarX } from 'lucide-react';

interface DatesSectionProps {
  title: string;
  dates: string[];
  eventType: 'rig' | 'event' | 'rigDown';
  autoSync: boolean;
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
}

export const DatesSection = ({ 
  title, 
  dates, 
  eventType,
  autoSync,
  onAddDate,
  onRemoveDate
}: DatesSectionProps) => {
  // Check if there's only one date of this type
  const isOnlyOneDate = dates.length === 1;
  
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-medium mb-1">{title}:</p>
        <AddDateButton 
          eventType={eventType} 
          onAddDate={onAddDate}
          autoSync={autoSync}
        />
      </div>
      
      {dates.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {dates.map(date => (
            <DateBadge 
              key={date} 
              date={date} 
              eventType={eventType}
              onRemoveDate={onRemoveDate}
              autoSync={autoSync}
              isOnlyDate={isOnlyOneDate}
            />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-sm flex items-center mt-2">
          <CalendarX className="h-4 w-4 mr-1" />
          Inga datum schemalagda
        </div>
      )}
    </div>
  );
}
