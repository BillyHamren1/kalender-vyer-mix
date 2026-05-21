import { supabase } from "@/integrations/supabase/client";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sync a standalone project (no booking) to calendar events.
 * Creates rig/event/rigDown events just like booking-based projects.
 * Includes verification and retry logic to ensure events are actually created.
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
    customer_pickup?: boolean | null;
  }

): Promise<{ success: boolean; eventsCreated: number }> => {
  console.log(`[projectCalendarService] Syncing standalone project ${projectId} to calendar`);

  const title = projectData.client || projectData.name || 'Projekt';
  const address = [projectData.deliveryaddress, projectData.delivery_city].filter(Boolean).join(', ') || '';
  const projectBookingId = `project-${projectId}`;

  // Remove existing calendar events for this project
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
    const sourceDate = dateField.split('T')[0];
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
      organization_id: projectData.organization_id,
      source_date: sourceDate,
      customer_pickup: projectData.customer_pickup === true,
    });
  };

  addEvent(projectData.rigdaydate, projectData.rig_start_time, projectData.rig_end_time, 'rig', 'team-1');
  addEvent(projectData.eventdate, projectData.event_start_time, projectData.event_end_time, 'event', 'team-11');
  addEvent(projectData.rigdowndate, projectData.rigdown_start_time, projectData.rigdown_end_time, 'rigDown', 'team-1');

  if (events.length === 0) {
    console.log(`[projectCalendarService] No dates to sync for project ${projectId}`);
    return { success: true, eventsCreated: 0 };
  }

  // Insert with retry
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('calendar_events')
      .insert(events);

    if (error) {
      console.error(`[projectCalendarService] Insert attempt ${attempt + 1} failed:`, error);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new Error(`Kalenderhändelser kunde inte skapas efter ${MAX_RETRIES + 1} försök: ${error.message}`);
    }

    // Verify events were actually created
    const { count, error: verifyError } = await supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', projectBookingId);

    if (verifyError || (count ?? 0) < events.length) {
      console.error(`[projectCalendarService] Verification failed: expected ${events.length}, got ${count ?? 0}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        // Clean up partial inserts before retry
        await supabase.from('calendar_events').delete().eq('booking_id', projectBookingId);
        continue;
      }
      throw new Error(`Kalenderhändelser skapades inte korrekt. Förväntade ${events.length}, hittade ${count ?? 0}.`);
    }

    console.log(`[projectCalendarService] ✅ Verified ${count} calendar events for project ${projectId}`);
    return { success: true, eventsCreated: count ?? events.length };
  }

  throw new Error('Kalenderhändelser kunde inte skapas.');
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
