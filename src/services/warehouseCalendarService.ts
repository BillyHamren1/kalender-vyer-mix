import { supabase } from "@/integrations/supabase/client";
import { format, subDays, addDays, parseISO, setHours, setMinutes } from "date-fns";

// Warehouse event types
export type WarehouseEventType = 'packing' | 'delivery' | 'event' | 'return' | 'inventory' | 'unpacking';

// Default rules for warehouse events
const WAREHOUSE_RULES: Record<WarehouseEventType, {
  basedOn: 'rigDate' | 'eventDate' | 'rigDownDate';
  daysBefore?: number;
  daysAfter?: number;
  startHour: number;
  startMinute: number;
  durationHours: number;
}> = {
  packing: {
    basedOn: 'rigDate',
    daysBefore: 4,
    startHour: 8,
    startMinute: 0,
    durationHours: 8
  },
  delivery: {
    basedOn: 'rigDate',
    daysBefore: 0,
    startHour: 7,
    startMinute: 0,
    durationHours: 2
  },
  event: {
    basedOn: 'eventDate',
    daysBefore: 0,
    startHour: 9,
    startMinute: 0,
    durationHours: 8
  },
  return: {
    basedOn: 'rigDownDate',
    daysBefore: 0,
    startHour: 17,
    startMinute: 0,
    durationHours: 2
  },
  inventory: {
    basedOn: 'rigDownDate',
    daysAfter: 1,
    startHour: 8,
    startMinute: 0,
    durationHours: 2
  },
  unpacking: {
    basedOn: 'rigDownDate',
    daysAfter: 1,
    startHour: 10,
    startMinute: 0,
    durationHours: 2
  }
};

// Event type labels in Swedish
export const WAREHOUSE_EVENT_LABELS: Record<WarehouseEventType, string> = {
  packing: 'Packning',
  delivery: 'Utleverans',
  event: 'Event',
  return: 'Återleverans',
  inventory: 'Inventering',
  unpacking: 'Upppackning'
};

// Event type colors
export const WAREHOUSE_EVENT_COLORS: Record<WarehouseEventType, string> = {
  packing: '#E9D5FF',    // Purple
  delivery: '#DBEAFE',   // Blue
  event: '#FEF7CD',      // Yellow
  return: '#FFEDD5',     // Orange
  inventory: '#CFFAFE',  // Cyan
  unpacking: '#F3F4F6'   // Gray
};

interface BookingData {
  id: string;
  booking_number?: string;
  client: string;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  deliveryaddress?: string;
  rig_start_time?: string;
  rig_end_time?: string;
  event_start_time?: string;
  event_end_time?: string;
  rigdown_start_time?: string;
  rigdown_end_time?: string;
}

// Calculate event datetime based on rules
function calculateEventDateTime(
  baseDate: string,
  rule: typeof WAREHOUSE_RULES[WarehouseEventType],
  customStartTime?: string,
  customEndTime?: string
): { start: Date; end: Date } {
  let date = parseISO(baseDate);
  
  if (rule.daysBefore) {
    date = subDays(date, rule.daysBefore);
  }
  if (rule.daysAfter) {
    date = addDays(date, rule.daysAfter);
  }
  
  let start: Date;
  let end: Date;
  
  // Use custom times if provided (for event type)
  if (customStartTime && customEndTime) {
    const [startHour, startMin] = customStartTime.split(':').map(Number);
    const [endHour, endMin] = customEndTime.split(':').map(Number);
    start = setMinutes(setHours(date, startHour), startMin);
    end = setMinutes(setHours(date, endHour), endMin);
  } else {
    start = setMinutes(setHours(date, rule.startHour), rule.startMinute);
    end = new Date(start.getTime() + rule.durationHours * 60 * 60 * 1000);
  }
  
  return { start, end };
}

// Sync a booking to the warehouse calendar
export async function syncBookingToWarehouseCalendar(booking: BookingData): Promise<void> {
  console.log('[WarehouseCalendar] Syncing booking:', booking.id);
  
  // Need at least one date to create events
  if (!booking.rigdaydate && !booking.eventdate && !booking.rigdowndate) {
    console.log('[WarehouseCalendar] No dates found, skipping');
    return;
  }
  
  // Remove existing warehouse events for this booking
  await removeWarehouseEventsForBooking(booking.id);
  
  const eventsToCreate: Array<{
    booking_id: string;
    booking_number: string | null;
    title: string;
    start_time: string;
    end_time: string;
    resource_id: string;
    event_type: WarehouseEventType;
    delivery_address: string | null;
    source_rig_date: string | null;
    source_event_date: string | null;
    source_rigdown_date: string | null;
  }> = [];
  
  const clientName = booking.client || 'Okänd kund';
  const bookingNum = booking.booking_number || '';
  
  // Create packing event (based on rig date)
  if (booking.rigdaydate) {
    const rule = WAREHOUSE_RULES.packing;
    const { start, end } = calculateEventDateTime(booking.rigdaydate, rule);
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Packning - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'packing',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null
    });
  }
  
  // Create delivery event (based on rig date)
  if (booking.rigdaydate) {
    const rule = WAREHOUSE_RULES.delivery;
    const { start, end } = calculateEventDateTime(booking.rigdaydate, rule);
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Utleverans - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'delivery',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null
    });
  }
  
  // Create event (based on event date)
  if (booking.eventdate) {
    const rule = WAREHOUSE_RULES.event;
    const { start, end } = calculateEventDateTime(
      booking.eventdate, 
      rule,
      booking.event_start_time || undefined,
      booking.event_end_time || undefined
    );
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Event - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'event',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate,
      source_rigdown_date: booking.rigdowndate || null
    });
  }
  
  // Create return event (based on rigdown date)
  if (booking.rigdowndate) {
    const rule = WAREHOUSE_RULES.return;
    const { start, end } = calculateEventDateTime(booking.rigdowndate, rule);
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Återleverans - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'return',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate
    });
  }
  
  // Create inventory event (day after rigdown)
  if (booking.rigdowndate) {
    const rule = WAREHOUSE_RULES.inventory;
    const { start, end } = calculateEventDateTime(booking.rigdowndate, rule);
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Inventering - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'inventory',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate
    });
  }
  
  // Create unpacking event (day after rigdown, after inventory)
  if (booking.rigdowndate) {
    const rule = WAREHOUSE_RULES.unpacking;
    const { start, end } = calculateEventDateTime(booking.rigdowndate, rule);
    
    eventsToCreate.push({
      booking_id: booking.id,
      booking_number: bookingNum,
      title: `Upppackning - ${clientName}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      resource_id: 'warehouse',
      event_type: 'unpacking',
      delivery_address: booking.deliveryaddress || null,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate
    });
  }
  
  // Insert all events
  if (eventsToCreate.length > 0) {
    const { error } = await supabase
      .from('warehouse_calendar_events')
      .insert(eventsToCreate);
    
    if (error) {
      console.error('[WarehouseCalendar] Error creating events:', error);
      throw error;
    }
    
    console.log(`[WarehouseCalendar] Created ${eventsToCreate.length} warehouse events for booking ${booking.id}`);
  }
}

// Remove all warehouse events for a booking
export async function removeWarehouseEventsForBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('warehouse_calendar_events')
    .delete()
    .eq('booking_id', bookingId);
  
  if (error) {
    console.error('[WarehouseCalendar] Error removing events:', error);
    throw error;
  }
}

// Check for changes in staff calendar and mark warehouse events
export async function checkAndMarkWarehouseChanges(
  bookingId: string,
  newRigDate: string | null,
  newRigDownDate: string | null,
  newEventDate: string | null
): Promise<void> {
  console.log('[WarehouseCalendar] Checking for changes:', { bookingId, newRigDate, newRigDownDate, newEventDate });
  
  // Get existing warehouse events for this booking
  const { data: existingEvents, error } = await supabase
    .from('warehouse_calendar_events')
    .select('*')
    .eq('booking_id', bookingId);
  
  if (error || !existingEvents || existingEvents.length === 0) {
    console.log('[WarehouseCalendar] No existing events found');
    return;
  }
  
  const updates: Array<{ id: string; has_source_changes: boolean; change_details: string }> = [];
  
  for (const event of existingEvents) {
    // Skip if already manually adjusted
    if (event.manually_adjusted) continue;
    
    let hasChanges = false;
    let changeDetails = '';
    
    // Check rig date changes (affects packing and delivery)
    if ((event.event_type === 'packing' || event.event_type === 'delivery') && event.source_rig_date) {
      if (newRigDate && event.source_rig_date !== newRigDate) {
        hasChanges = true;
        changeDetails = `Montagedatum ändrat: ${event.source_rig_date} → ${newRigDate}`;
      }
    }
    
    // Check event date changes (affects event)
    if (event.event_type === 'event' && event.source_event_date) {
      if (newEventDate && event.source_event_date !== newEventDate) {
        hasChanges = true;
        changeDetails = `Eventdatum ändrat: ${event.source_event_date} → ${newEventDate}`;
      }
    }
    
    // Check rigdown date changes (affects return, inventory, unpacking)
    if (['return', 'inventory', 'unpacking'].includes(event.event_type) && event.source_rigdown_date) {
      if (newRigDownDate && event.source_rigdown_date !== newRigDownDate) {
        hasChanges = true;
        changeDetails = `Nedmonteringsdatum ändrat: ${event.source_rigdown_date} → ${newRigDownDate}`;
      }
    }
    
    if (hasChanges) {
      updates.push({
        id: event.id,
        has_source_changes: true,
        change_details: changeDetails
      });
    }
  }
  
  // Apply updates
  for (const update of updates) {
    await supabase
      .from('warehouse_calendar_events')
      .update({
        has_source_changes: update.has_source_changes,
        change_details: update.change_details
      })
      .eq('id', update.id);
  }
  
  if (updates.length > 0) {
    console.log(`[WarehouseCalendar] Marked ${updates.length} events as changed`);
  }
}

// Mark a warehouse event as viewed/acknowledged
export async function markWarehouseEventAsViewed(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('warehouse_calendar_events')
    .update({ 
      has_source_changes: false,
      viewed: true 
    })
    .eq('id', eventId);
  
  if (error) {
    console.error('[WarehouseCalendar] Error marking as viewed:', error);
    throw error;
  }
}

// Mark event as manually adjusted
export async function markWarehouseEventAsAdjusted(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('warehouse_calendar_events')
    .update({ 
      manually_adjusted: true,
      has_source_changes: false 
    })
    .eq('id', eventId);
  
  if (error) {
    console.error('[WarehouseCalendar] Error marking as adjusted:', error);
    throw error;
  }
}

// Fetch warehouse events for a date range
export async function fetchWarehouseEvents(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('warehouse_calendar_events')
    .select('*')
    .gte('start_time', startDate)
    .lte('end_time', endDate)
    .order('start_time', { ascending: true });
  
  if (error) {
    console.error('[WarehouseCalendar] Error fetching events:', error);
    throw error;
  }
  
  return data || [];
}

// Sync all existing bookings to warehouse calendar (for initial setup)
export async function syncAllBookingsToWarehouse(): Promise<{ synced: number; errors: number }> {
  console.log('[WarehouseCalendar] Starting full sync...');
  
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .in('status', ['Bekräftad', 'Confirmed']);
  
  if (error) {
    console.error('[WarehouseCalendar] Error fetching bookings:', error);
    throw error;
  }
  
  let synced = 0;
  let errors = 0;
  
  for (const booking of bookings || []) {
    try {
      await syncBookingToWarehouseCalendar(booking);
      synced++;
    } catch (e) {
      console.error(`[WarehouseCalendar] Error syncing booking ${booking.id}:`, e);
      errors++;
    }
  }
  
  console.log(`[WarehouseCalendar] Full sync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}
