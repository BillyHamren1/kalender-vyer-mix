
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';

export const useEventNavigation = () => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);

  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    console.log('Event clicked:', info.event);
    console.log('Booking ID:', bookingId);
    
    // Show context menu with options
    const showContextMenu = (e: any) => {
      e.preventDefault();
      
      // Store the selected event for later use
      const selectedEvent = {
        id: info.event.id,
        title: info.event.title,
        resourceId: info.event.extendedProps.resourceId
      };
      
      // Create and dispatch a custom event to trigger the dialog
      const customEvent = new CustomEvent('openDuplicateDialog', { detail: selectedEvent });
      document.dispatchEvent(customEvent);
    };
    
    // Add right-click event listener to show context menu
    const eventEl = info.el;
    eventEl.addEventListener('contextmenu', showContextMenu);
    
    // Handle normal click (navigation to booking)
    if (bookingId) {
      // Save current date and path before navigating
      setLastViewedDate(info.event.start);
      setLastPath(window.location.pathname);
      
      navigate(`/booking/${bookingId}`);
      console.log(`Navigating to /booking/${bookingId}`);
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
