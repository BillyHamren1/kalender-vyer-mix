
import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/calendarService';
import { toast } from 'sonner';

export const useCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  
  // Get the date from URL or session storage if it exists
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const storedDate = sessionStorage.getItem('calendarDate');
    return storedDate ? new Date(storedDate) : new Date();
  });
  
  useEffect(() => {
    const loadEvents = async () => {
      try {
        setIsLoading(true);
        const data = await fetchCalendarEvents();
        
        // If there are no events from the database, try to get them from localStorage
        if (data.length === 0) {
          const storedEvents = localStorage.getItem('calendarEvents');
          if (storedEvents) {
            try {
              setEvents(JSON.parse(storedEvents));
            } catch (error) {
              console.error('Error parsing stored events:', error);
            }
          }
        } else {
          setEvents(data);
          // Store the events in localStorage as a cache
          localStorage.setItem('calendarEvents', JSON.stringify(data));
        }
      } catch (error) {
        console.error('Error loading calendar events:', error);
        
        // Fallback to localStorage if API fails
        const storedEvents = localStorage.getItem('calendarEvents');
        if (storedEvents) {
          try {
            setEvents(JSON.parse(storedEvents));
          } catch (error) {
            console.error('Error parsing stored events:', error);
          }
        }
        
        toast.error('Failed to load calendar events');
      } finally {
        setIsLoading(false);
        setIsMounted(true);
      }
    };
    
    loadEvents();
    
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      localStorage.setItem('calendarEvents', JSON.stringify(events));
    }
  }, [events]);
  
  const handleDatesSet = (dateInfo: any) => {
    setCurrentDate(dateInfo.start);
    console.log("Date range changed:", dateInfo.startStr, "to", dateInfo.endStr);
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
