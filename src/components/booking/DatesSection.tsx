
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
  // Deduplicate dates to avoid React key warnings
  const uniqueDates = [...new Set(dates)];
  
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
      
      {uniqueDates.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {uniqueDates.map(date => (
            <DateBadge 
              key={`${eventType}-${date}`} 
              date={date} 
              eventType={eventType}
              onRemoveDate={onRemoveDate}
              autoSync={autoSync}
            />
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-sm flex items-center mt-2">
          <CalendarX className="h-4 w-4 mr-1" />
          No dates scheduled
        </div>
      )}
    </div>
  );
};
