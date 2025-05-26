
import { supabase } from "@/integrations/supabase/client";
import { CalendarEvent } from "@/components/Calendar/ResourceData";
import { mapDatabaseToAppResourceId } from "./eventService";

// Generate a unique client ID for this browser session
const getClientId = (): string => {
  let clientId = sessionStorage.getItem('calendar-client-id');
  if (!clientId) {
    clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('calendar-client-id', clientId);
  }
  return clientId;
};

// Get the last sync timestamp for this client
export const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const clientId = getClientId();
    const { data, error } = await supabase
      .from('client_sync_state')
      .select('last_sync_timestamp')
      .eq('client_id', clientId)
      .eq('sync_type', 'calendar_events')
      .maybeSingle();

    if (error) {
      console.error('Error getting last sync timestamp:', error);
      return null;
    }

    return data ? new Date(data.last_sync_timestamp) : null;
  } catch (error) {
    console.error('Error in getLastSyncTimestamp:', error);
    return null;
  }
};

// Update the last sync timestamp for this client
export const updateLastSyncTimestamp = async (timestamp: Date): Promise<void> => {
  try {
    const clientId = getClientId();
    const { error } = await supabase
      .from('client_sync_state')
      .upsert({
        client_id: clientId,
        sync_type: 'calendar_events',
        last_sync_timestamp: timestamp.toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'client_id,sync_type'
      });

    if (error) {
      console.error('Error updating last sync timestamp:', error);
    }
  } catch (error) {
    console.error('Error in updateLastSyncTimestamp:', error);
  }
};

// Fetch calendar events incrementally based on timestamp
export const fetchCalendarEventsIncremental = async (since?: Date): Promise<CalendarEvent[]> => {
  try {
    console.log('Fetching calendar events incrementally', since ? `since ${since.toISOString()}` : 'full sync');
    
    let query = supabase
      .from('calendar_events')
      .select('*')
      .order('updated_at', { ascending: false });

    // If we have a timestamp, only fetch events updated since then
    if (since) {
      query = query.gt('updated_at', since.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('No new events found');
      return [];
    }

    console.log(`Found ${data.length} ${since ? 'updated' : ''} calendar events`);

    // Get all unique booking IDs to fetch their delivery addresses
    const bookingIds = data
      .filter(event => event.booking_id)
      .map(event => event.booking_id)
      .filter((id, index, self) => id && self.indexOf(id) === index);

    // Fetch delivery addresses for all bookings in one request
    let bookingAddresses: Record<string, string> = {};
    if (bookingIds.length > 0) {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('id, deliveryaddress, delivery_city')
        .in('id', bookingIds);

      if (bookingError) {
        console.error('Error fetching booking addresses:', bookingError);
      } else if (bookingData) {
        bookingData.forEach(booking => {
          const address = booking.deliveryaddress || '';
          const city = booking.delivery_city || '';
          const formattedAddress = [address, city].filter(Boolean).join(', ');
          bookingAddresses[booking.id] = formattedAddress || 'No address provided';
        });
      }
    }

    // Map data to CalendarEvent format
    const mappedEvents = data.map(event => {
      const mappedResourceId = mapDatabaseToAppResourceId(event.resource_id);
      const eventType = event.event_type as 'rig' | 'event' | 'rigDown';
      const bookingId = event.booking_id || '';
      const deliveryAddress = bookingAddresses[bookingId] || event.delivery_address || 'No address provided';
      
      const calendarEvent: CalendarEvent = {
        id: event.id,
        resourceId: mappedResourceId,
        title: event.title,
        start: event.start_time,
        end: event.end_time,
        eventType: eventType,
        bookingId: bookingId,
        bookingNumber: event.booking_number || bookingId || 'No ID',
        deliveryAddress: deliveryAddress
      };
      
      return calendarEvent;
    });

    // Update the last sync timestamp
    if (data.length > 0) {
      const latestTimestamp = new Date(Math.max(...data.map(event => new Date(event.updated_at || event.created_at).getTime())));
      await updateLastSyncTimestamp(latestTimestamp);
    }

    return mappedEvents;
  } catch (error) {
    console.error('Error in fetchCalendarEventsIncremental:', error);
    throw error;
  }
};

// Remove duplicate events based on ID
export const deduplicateEvents = (existingEvents: CalendarEvent[], newEvents: CalendarEvent[]): CalendarEvent[] => {
  const existingEventIds = new Set(existingEvents.map(event => event.id));
  const updatedEventIds = new Set(newEvents.map(event => event.id));
  
  // Remove existing events that have been updated
  const filteredExistingEvents = existingEvents.filter(event => !updatedEventIds.has(event.id));
  
  // Add all new/updated events
  const combinedEvents = [...filteredExistingEvents, ...newEvents];
  
  // Final deduplication by ID (just in case)
  const uniqueEvents = combinedEvents.filter((event, index, self) => 
    index === self.findIndex(e => e.id === event.id)
  );
  
  console.log(`Deduplicated events: ${existingEvents.length} existing + ${newEvents.length} new = ${uniqueEvents.length} final`);
  
  return uniqueEvents;
};
