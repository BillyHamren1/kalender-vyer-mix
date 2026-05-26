
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { supabase } from '@/integrations/supabase/client';

export const useEventNavigation = () => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);

  const getBookingId = (info: any) =>
    info.event.extendedProps?.bookingId ||
    info.event.extendedProps?.booking_id ||
    info.event._def?.extendedProps?.bookingId ||
    info.event._def?.extendedProps?.booking_id ||
    info.event.bookingId ||
    info.event.booking_id;

  const getLargeProjectId = (info: any) =>
    info.event.extendedProps?.largeProjectId ||
    info.event._def?.extendedProps?.largeProjectId;

  const attachContextMenu = (info: any) => {
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
  };

  const navigateToProjectFromBooking = async (bookingId: string, directLargeProjectId?: string) => {
    if (directLargeProjectId) {
      const { data: lp } = await supabase
        .from('large_projects')
        .select('id')
        .eq('id', directLargeProjectId)
        .is('deleted_at', null)
        .maybeSingle();
      if (lp?.id) {
        navigate(`/large-project/${lp.id}`);
        return true;
      }
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('assigned_project_id, large_project_id')
      .eq('id', bookingId)
      .single();

    if (booking?.large_project_id) {
      const { data: lp } = await supabase
        .from('large_projects')
        .select('id')
        .eq('id', booking.large_project_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (lp?.id) {
        navigate(`/large-project/${lp.id}`);
        return true;
      }
      // Stale reference — clear it so future clicks fall through correctly
      await supabase.from('bookings').update({ large_project_id: null }).eq('id', bookingId);
    }

    if (booking?.assigned_project_id) {
      const { data: mp } = await supabase
        .from('projects')
        .select('id')
        .eq('id', booking.assigned_project_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (mp?.id) {
        navigate(`/project/${mp.id}`);
        return true;
      }
      // Stale reference — clear so the booking is treated as unassigned
      await supabase
        .from('bookings')
        .update({ assigned_project_id: null, assigned_project_name: null, assigned_to_project: false })
        .eq('id', bookingId);
    }

    const { data: mediumProject } = await supabase
      .from('projects')
      .select('id')
      .eq('booking_id', bookingId)
      .not('status', 'in', '("completed","cancelled")')
      .is('deleted_at', null)
      .maybeSingle();

    if (mediumProject?.id) {
      navigate(`/project/${mediumProject.id}`);
      return true;
    }

    return false;
  };


  const handleEventClick = async (info: any) => {
    const bookingId = getBookingId(info);
    const largeProjectId = getLargeProjectId(info);
    const forceBookingDetail =
      info.event.extendedProps?.forceBookingDetail ||
      info.event._def?.extendedProps?.forceBookingDetail;

    attachContextMenu(info);

    if (!bookingId) {
      toast.warning('Cannot open project', {
        description: 'This event is not linked to a booking'
      });
      return;
    }

    try {
      setLastViewedDate(info.event.start);
      setLastPath(window.location.pathname);

      if (forceBookingDetail) {
        navigate(`/booking/${bookingId}`);
        return;
      }

      const openedProject = await navigateToProjectFromBooking(bookingId, largeProjectId);
      if (openedProject) return;

      navigate(`/booking/${bookingId}`);
    } catch (error) {
      console.error('Navigation error:', error);
      toast.error('Navigation failed', {
        description: 'Could not open the linked project'
      });
    }
  };

  // Variant for staff calendar: ALWAYS navigate to project view
  // (medium project = /project/:projectId, large project = /large-project/:id)
  // Never opens the booking detail page.
  const handleProjectEventClick = async (info: any) => {
    const bookingId = getBookingId(info);
    const largeProjectId = getLargeProjectId(info);

    if (!bookingId) {
      toast.warning('Kan inte öppna projekt', {
        description: 'Detta event är inte kopplat till ett projekt'
      });
      return;
    }

    try {
      setLastViewedDate(info.event.start);
      setLastPath(window.location.pathname);

      const openedProject = await navigateToProjectFromBooking(bookingId, largeProjectId);
      if (openedProject) return;

      toast.warning('Kan inte öppna projekt', {
        description: 'Bokningen saknar kopplat projekt'
      });
    } catch (error) {
      console.error('Project navigation error:', error);
      toast.error('Navigering misslyckades', {
        description: 'Kunde inte öppna projektvyn'
      });
    }
  };

  return {
    handleEventClick,
    handleProjectEventClick
  };
};
