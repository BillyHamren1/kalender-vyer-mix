
import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { toast } from 'sonner';

export const useCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize currentDate from sessionStorage or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      try {
        console.log('Fetching calendar events...');
        const data = await fetchCalendarEvents();
        if (active) {
          console.log('Calendar events loaded successfully:', data);
          console.log('Resource IDs in events:', data.map(event => event.resourceId));
          setEvents(data);
        }
      } catch (error) {
        console.error('Error loading calendar events:', error);
        toast.error('Kunde inte ladda kalenderhändelser');
      } finally {
        if (active) {
          setIsLoading(false);
          setIsMounted(true);
        }
      }
    };

    loadEvents();

    return () => {
      active = false;
    };
  }, []);

  const handleDatesSet = (dateInfo: any) => {
    setCurrentDate(dateInfo.start);
    sessionStorage.setItem('calendarDate', dateInfo.start.toISOString());
  };

  return {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet
  };
};
