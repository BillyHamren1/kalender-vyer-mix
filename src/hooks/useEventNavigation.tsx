
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/contexts/CalendarContext';

export const useEventNavigation = () => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);

  const handleEventClick = (info: any) => {
    console.log('Event clicked - full info:', info);
    console.log('Event object:', info.event);
    console.log('Extended props:', info.event.extendedProps);
    
    // Try multiple ways to get the booking ID with more comprehensive extraction
    const bookingId = info.event.extendedProps?.bookingId || 
                     info.event.extendedProps?.booking_id ||
                     info.event._def?.extendedProps?.bookingId ||
                     info.event._def?.extendedProps?.booking_id ||
                     info.event.bookingId ||
                     info.event.booking_id;
    
    console.log('Extracted booking ID:', bookingId);
    
    // Show context menu with options on right-click
    const showContextMenu = (e: any) => {
      e.preventDefault();
      
      // Store the selected event for later use
      const selectedEvent = {
        id: info.event.id,
        title: info.event.title,
        resourceId: info.event.extendedProps?.resourceId || info.event._def?.resourceIds?.[0]
      };
      
      // Create and dispatch a custom event to trigger the dialog
      const customEvent = new CustomEvent('openDuplicateDialog', { detail: selectedEvent });
      document.dispatchEvent(customEvent);
    };
    
    // Add right-click event listener to show context menu
    const eventEl = info.el;
    if (eventEl) {
      eventEl.addEventListener('contextmenu', showContextMenu);
    }
    
    // Handle normal click (navigation to booking)
    if (bookingId) {
      try {
        // Save current date and path before navigating
        setLastViewedDate(info.event.start);
        setLastPath(window.location.pathname);
        
        console.log(`Navigating to /booking/${bookingId}`);
        navigate(`/booking/${bookingId}`);
      } catch (error) {
        console.error('Navigation error:', error);
        toast.error("Navigation failed", {
          description: "Could not navigate to booking details"
        });
      }
    } else {
      console.warn('No booking ID found for this event');
      console.log('Available event properties:', Object.keys(info.event.extendedProps || {}));
      console.log('Event def properties:', Object.keys(info.event._def?.extendedProps || {}));
      
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  return {
    handleEventClick
  };
};
