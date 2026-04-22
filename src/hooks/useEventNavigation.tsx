
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { supabase } from '@/integrations/supabase/client';

export const useEventNavigation = () => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);

  const handleEventClick = async (info: any) => {
    console.log('Event clicked - full info:', info);
    console.log('Event object:', info.event);
    console.log('Extended props:', info.event.extendedProps);
    
    // Try multiple ways to get the booking ID
    const bookingId = info.event.extendedProps?.bookingId || 
                     info.event.extendedProps?.booking_id ||
                     info.event._def?.extendedProps?.bookingId ||
                     info.event._def?.extendedProps?.booking_id ||
                     info.event.bookingId ||
                     info.event.booking_id;

    // Check for large project ID directly on the event
    const largeProjectId = info.event.extendedProps?.largeProjectId ||
                          info.event._def?.extendedProps?.largeProjectId;
    
    console.log('Extracted booking ID:', bookingId);
    
    // Show context menu with options on right-click
    const showContextMenu = (e: any) => {
      e.preventDefault();
      const selectedEvent = {
        id: info.event.id,
        title: info.event.title,
        resourceId: info.event.extendedProps?.resourceId || info.event._def?.resourceIds?.[0]
      };
      const customEvent = new CustomEvent('openDuplicateDialog', { detail: selectedEvent });
      document.dispatchEvent(customEvent);
    };
    
    const eventEl = info.el;
    if (eventEl) {
      eventEl.addEventListener('contextmenu', showContextMenu);
    }
    
    if (bookingId) {
      try {
        setLastViewedDate(info.event.start);
        setLastPath(window.location.pathname);

        // If we already know it's a large project, navigate directly
        if (largeProjectId) {
          console.log(`Navigating to large project /large-project/${largeProjectId}`);
          navigate(`/large-project/${largeProjectId}`);
          return;
        }

        // Check if the booking belongs to a large project
        const { data: booking } = await supabase
          .from('bookings')
          .select('large_project_id')
          .eq('id', bookingId)
          .single();

        if (booking?.large_project_id) {
          console.log(`Booking belongs to large project, navigating to /large-project/${booking.large_project_id}`);
          navigate(`/large-project/${booking.large_project_id}`);
        } else {
          console.log(`Navigating to /booking/${bookingId}`);
          navigate(`/booking/${bookingId}`);
        }
      } catch (error) {
        console.error('Navigation error:', error);
        toast.error("Navigation failed", {
          description: "Could not navigate to booking details"
        });
      }
    } else {
      console.warn('No booking ID found for this event');
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  return {
    handleEventClick
  };
};
