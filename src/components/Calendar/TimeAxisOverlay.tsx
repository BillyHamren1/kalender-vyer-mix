import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface TimeAxisOverlayProps {
  onTimeClick: (time: Date) => void;
  currentDate: Date;
}

const TimeAxisOverlay: React.FC<TimeAxisOverlayProps> = ({ onTimeClick, currentDate }) => {
  const [timeSlots, setTimeSlots] = useState<{ time: Date; label: string }[]>([]);

  useEffect(() => {
    // Generate time slots from 06:00 to 22:00
    const slots = [];
    for (let hour = 6; hour <= 21; hour++) {
      const time = new Date(currentDate);
      time.setHours(hour, 0, 0, 0);
      slots.push({
        time,
        label: `${hour.toString().padStart(2, '0')}:00`
      });
    }
    setTimeSlots(slots);
  }, [currentDate]);

  return (
    <div className="absolute left-0 top-[45px] w-[80px] z-50 pointer-events-none">
      <div className="relative pointer-events-auto">
        {timeSlots.map((slot, index) => (
          <div
            key={index}
            onClick={() => onTimeClick(slot.time)}
            className="h-[60px] flex items-start justify-center pt-1 cursor-pointer 
                       hover:bg-primary/20 border-b border-border/50 transition-all
                       group relative animate-in fade-in duration-300"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              {slot.label}
            </span>
            <ChevronRight 
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 text-primary 
                         opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" 
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimeAxisOverlay;
