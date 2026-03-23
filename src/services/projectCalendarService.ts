import { supabase } from "@/integrations/supabase/client";

/**
 * Sync a standalone project (no booking) to calendar events.
 * Creates rig/event/rigDown events just like booking-based projects.
 */
export const syncStandaloneProjectToCalendar = async (
  projectId: string,
  projectData: {
    id: string;
    organization_id?: string;
    client?: string | null;
    name?: string;
    rigdaydate?: string | null;
    eventdate?: string | null;
    rigdowndate?: string | null;
    rig_start_time?: string | null;
    rig_end_time?: string | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
    rigdown_start_time?: string | null;
    rigdown_end_time?: string | null;
    deliveryaddress?: string | null;
    delivery_city?: string | null;
  }
): Promise<void> => {
  console.log(`[projectCalendarService] Syncing standalone project ${projectId} to calendar`);

  const title = projectData.client || projectData.name || 'Projekt';
  const address = [projectData.deliveryaddress, projectData.delivery_city].filter(Boolean).join(', ') || '';

  // Remove existing calendar events for this project (use booking_id = project id with prefix)
  const projectBookingId = `project-${projectId}`;

  await supabase
    .from('calendar_events')
    .delete()
    .eq('booking_id', projectBookingId);

  const events: any[] = [];

  const addEvent = (
    dateField: string | null | undefined,
    startTimeField: string | null | undefined,
    endTimeField: string | null | undefined,
    eventType: 'rig' | 'event' | 'rigDown',
    resourceId: string
  ) => {
    if (!dateField) return;
    const startTime = startTimeField || `${dateField}T08:00:00`;
    const endTime = endTimeField || `${dateField}T14:00:00`;

    events.push({
      title,
      start_time: startTime,
      end_time: endTime,
      resource_id: resourceId,
      event_type: eventType,
      booking_id: projectBookingId,
      booking_number: `P-${projectId.slice(0, 6)}`,
      delivery_address: address || 'Ingen adress',
      organization_id: projectData.organization_id
    });
  };

  addEvent(projectData.rigdaydate, projectData.rig_start_time, projectData.rig_end_time, 'rig', 'team-1');
  addEvent(projectData.eventdate, projectData.event_start_time, projectData.event_end_time, 'event', 'team-11');
  addEvent(projectData.rigdowndate, projectData.rigdown_start_time, projectData.rigdown_end_time, 'rigDown', 'team-1');

  if (events.length > 0) {
    const { error } = await supabase
      .from('calendar_events')
      .insert(events);

    if (error) {
      console.error('[projectCalendarService] Error creating calendar events:', error);
      throw error;
    }
    console.log(`[projectCalendarService] Created ${events.length} calendar events for project ${projectId}`);
  }
};

/**
 * Remove all calendar events for a standalone project.
 */
export const removeStandaloneProjectEvents = async (projectId: string): Promise<void> => {
  const projectBookingId = `project-${projectId}`;
  await supabase
    .from('calendar_events')
    .delete()
    .eq('booking_id', projectBookingId);
};
