import { stockholmLocalInstant } from './warehousePlanningTime.ts';

/** Calendar arithmetic, never elapsed hours across a DST boundary. */
function addDays(date: string, days: number): string {
  stockholmLocalInstant(date, '12:00:00'); // validate the input date
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function buildWarehouseImportEvents(booking: any, orgId: string) {
  if (!booking.id || !orgId) throw new Error('Missing warehouse booking/organization');
  const events: any[] = [];
  const clientName = booking.client || 'Okänd kund';
  const deliveryAddress = booking.deliveryaddress || null;
  const bookingNumber = booking.booking_number || null;
  
  // Warehouse event rules based on warehouseCalendarService.ts
  // Packing: 4 days before rig, 08:00-11:00 (3 hours)
  if (booking.rigdaydate) {
    const packingDate = addDays(booking.rigdaydate, -4);
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Packning - ${clientName}`,
      event_type: 'packing',
      start_time: stockholmLocalInstant(packingDate, "08:00:00"),
      end_time: stockholmLocalInstant(packingDate, "11:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    // Delivery: same day as rig, 07:00-09:00
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Utleverans - ${clientName}`,
      event_type: 'delivery',
      start_time: stockholmLocalInstant(booking.rigdaydate, "07:00:00"),
      end_time: stockholmLocalInstant(booking.rigdaydate, "09:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Event: same day as eventdate, 09:00-17:00
  if (booking.eventdate) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Event - ${clientName}`,
      event_type: 'event',
      start_time: stockholmLocalInstant(booking.eventdate, "09:00:00"),
      end_time: stockholmLocalInstant(booking.eventdate, "17:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Return delivery, Inventory, Unpacking: for ALL rigdown dates
  const rigdownDates = booking.allRigdownDates && booking.allRigdownDates.length > 0
    ? booking.allRigdownDates : (booking.rigdowndate ? [booking.rigdowndate] : []);
  
  for (const rigdownDate of rigdownDates) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Återleverans - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `return_${rigdownDate}` : 'return',
      start_time: stockholmLocalInstant(rigdownDate, "17:00:00"),
      end_time: stockholmLocalInstant(rigdownDate, "19:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    const dayAfterRigdown = addDays(rigdownDate, 1);
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Inventering - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `inventory_${rigdownDate}` : 'inventory',
      start_time: stockholmLocalInstant(dayAfterRigdown, "08:00:00"),
      end_time: stockholmLocalInstant(dayAfterRigdown, "10:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Upppackning - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `unpacking_${rigdownDate}` : 'unpacking',
      start_time: stockholmLocalInstant(dayAfterRigdown, "10:00:00"),
      end_time: stockholmLocalInstant(dayAfterRigdown, "12:00:00"),
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  return events;
}

/** Suggestions are insert-only. An existing row belongs to warehouse planning.
 * ON CONFLICT DO NOTHING also protects edits concurrent with reimport.
 * Historical timezone repairs require a separate reviewed correction; importing
 * must never infer ownership from flags which older imports reset to false.
 */
export async function syncWarehouseEventsForBooking(supabase: any, booking: any, orgId: string): Promise<number> {
  const events = buildWarehouseImportEvents(booking, orgId);
  if (!events.length) return 0;
  const { data, error } = await supabase.from('warehouse_calendar_events')
    .upsert(events, { onConflict: 'organization_id,booking_id,event_type', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`Warehouse import failed: ${error.message}`);
  return data?.length ?? 0;
}
