import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingData {
  id: string;
  client: string;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  deliveryaddress?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_needed?: boolean;
  exact_time_info?: string;
  internalnotes?: string;
  status?: string;
  booking_number?: string;
  version?: number;
  assigned_project_id?: string;
  assigned_project_name?: string;
  assigned_to_project?: boolean;
}

/**
 * Safely parse assigned_to_project field which may be boolean, string, or null
 */
const parseAssignedToProject = (value: any): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    if (lowerValue === 'true' || lowerValue.startsWith('assigned to project')) {
      return true;
    }
    return false;
  }
  return false;
};

/**
 * Helper function to add days to a date string
 */
const addDays = (dateString: string, days: number): string => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

/**
 * Sync warehouse calendar events for a confirmed booking
 * Creates 6 logistics events based on rig/event/rigdown dates
 */
const syncWarehouseEventsForBooking = async (supabase: any, booking: any): Promise<number> => {
  console.log(`[Warehouse] Syncing warehouse events for booking ${booking.id}`);
  
  // Delete existing warehouse events for this booking (to avoid duplicates)
  const { error: deleteError } = await supabase
    .from('warehouse_calendar_events')
    .delete()
    .eq('booking_id', booking.id);
  
  if (deleteError) {
    console.error(`[Warehouse] Error deleting existing events:`, deleteError);
  }
  
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
      start_time: `${packingDate}T08:00:00`,
      end_time: `${packingDate}T11:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
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
      start_time: `${booking.rigdaydate}T07:00:00`,
      end_time: `${booking.rigdaydate}T09:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
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
      start_time: `${booking.eventdate}T09:00:00`,
      end_time: `${booking.eventdate}T17:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Return delivery: same day as rigdown, 17:00-19:00
  // Inventory: day after rigdown, 08:00-10:00
  // Unpacking: day after rigdown, 10:00-12:00
  if (booking.rigdowndate) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Återleverans - ${clientName}`,
      event_type: 'return',
      start_time: `${booking.rigdowndate}T17:00:00`,
      end_time: `${booking.rigdowndate}T19:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    const dayAfterRigdown = addDays(booking.rigdowndate, 1);
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Inventering - ${clientName}`,
      event_type: 'inventory',
      start_time: `${dayAfterRigdown}T08:00:00`,
      end_time: `${dayAfterRigdown}T10:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Upppackning - ${clientName}`,
      event_type: 'unpacking',
      start_time: `${dayAfterRigdown}T10:00:00`,
      end_time: `${dayAfterRigdown}T12:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Insert all warehouse events
  if (events.length > 0) {
    console.log(`[Warehouse] Inserting ${events.length} warehouse events for booking ${booking.id}`);
    const { error: insertError } = await supabase
      .from('warehouse_calendar_events')
      .insert(events);
    
    if (insertError) {
      console.error(`[Warehouse] Error inserting events:`, insertError);
      return 0;
    }
    
    console.log(`[Warehouse] Successfully created ${events.length} warehouse events for booking ${booking.id}`);
    return events.length;
  }
  
  return 0;
};

/**
 * Create packing project and tasks for a confirmed booking
 * Creates standard tasks with deadlines based on rig/event/rigdown dates
 */
const createPackingForBooking = async (supabase: any, booking: any): Promise<boolean> => {
  console.log(`[Packing] Checking if packing exists for booking ${booking.id}`);
  
  // Check if packing already exists for this booking
  const { data: existingPacking, error: checkError } = await supabase
    .from('packing_projects')
    .select('id')
    .eq('booking_id', booking.id)
    .limit(1);
  
  if (checkError) {
    console.error(`[Packing] Error checking existing packing:`, checkError);
    return false;
  }
  
  if (existingPacking && existingPacking.length > 0) {
    console.log(`[Packing] Packing already exists for booking ${booking.id}, skipping creation`);
    return false;
  }
  
  const clientName = booking.client || 'Okänd kund';
  const eventDate = booking.eventdate ? new Date(booking.eventdate).toLocaleDateString('sv-SE') : '';
  const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName;
  
  console.log(`[Packing] Creating packing project: ${packingName}`);
  
  // Create packing project
  const { data: newPacking, error: insertError } = await supabase
    .from('packing_projects')
    .insert({
      booking_id: booking.id,
      name: packingName,
      status: 'planning'
    })
    .select('id')
    .single();
  
  if (insertError || !newPacking) {
    console.error(`[Packing] Error creating packing project:`, insertError);
    return false;
  }
  
  console.log(`[Packing] Created packing project ${newPacking.id}`);
  
  // Create standard tasks with deadlines
  const tasks: any[] = [];
  let sortOrder = 0;
  
  // Tasks based on rigdaydate
  if (booking.rigdaydate) {
    // Packning påbörjad: rigdaydate - 4 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Packning påbörjad',
      description: 'Börja packa utrustning för bokningen',
      deadline: addDays(booking.rigdaydate, -4),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
    
    // Packlista klar: rigdaydate - 2 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Packlista klar',
      description: 'Verifiera att all utrustning på packlistan är kontrollerad',
      deadline: addDays(booking.rigdaydate, -2),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
    
    // Utrustning packad: rigdaydate - 1 day
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utrustning packad',
      description: 'All utrustning packad och redo för transport',
      deadline: addDays(booking.rigdaydate, -1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
    
    // Utleverans klarmarkerad: rigdaydate
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utleverans klarmarkerad',
      description: 'Bekräfta att leveransen har gått iväg',
      deadline: booking.rigdaydate,
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
  }
  
  // Tasks based on rigdowndate
  if (booking.rigdowndate) {
    // Inventering efter event: rigdowndate + 1 day
    tasks.push({
      packing_id: newPacking.id,
      title: 'Inventering efter event',
      description: 'Kontrollera att all utrustning är tillbaka och i gott skick',
      deadline: addDays(booking.rigdowndate, 1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
    
    // Upppackning klar: rigdowndate + 2 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Upppackning klar',
      description: 'All utrustning uppackad och återställd på lagerplats',
      deadline: addDays(booking.rigdowndate, 2),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
  }
  
  // Insert tasks
  if (tasks.length > 0) {
    console.log(`[Packing] Creating ${tasks.length} tasks for packing ${newPacking.id}`);
    const { error: tasksError } = await supabase
      .from('packing_tasks')
      .insert(tasks);
    
    if (tasksError) {
      console.error(`[Packing] Error creating packing tasks:`, tasksError);
    } else {
      console.log(`[Packing] Successfully created ${tasks.length} tasks`);
    }
  }
  
  return true;
};

interface ProductData {
  booking_id: string;
  name: string;
  quantity: number;
  notes?: string;
  unit_price?: number;
  total_price?: number;
  parent_product_id?: string;
  is_package_component?: boolean;
  parent_package_id?: string;
  sku?: string;
}

/**
 * Check if a product name indicates it's an accessory/sub-item
 * Accessories typically start with └, ↳, L, or similar prefixes
 */
const isAccessoryProduct = (name: string): boolean => {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.startsWith('└') || 
         trimmed.startsWith('↳') || 
         trimmed.startsWith('L,') || 
         trimmed.startsWith('└,') ||
         trimmed.startsWith('  ↳') ||
         trimmed.startsWith('  └');
};

/**
 * Check if a product is a package component (e.g., tent poles, roof sheets)
 * Package components have is_package_component: true from the external API
 */
const isPackageComponent = (product: any): boolean => {
  return product.is_package_component === true;
};

interface AttachmentData {
  booking_id: string;
  url: string;
  file_name: string;
  file_type: string;
}

/**
 * Helper function to calculate end time based on event type
 */
const getEndTimeForEventType = (startTime: string, eventType: 'rig' | 'event' | 'rigDown'): string => {
  const start = new Date(startTime);
  let hoursToAdd: number;
  
  switch (eventType) {
    case 'rig':
      hoursToAdd = 4; // 4 hours for rig events
      break;
    case 'event':
      hoursToAdd = 2.5; // 2.5 hours for event days
      break;
    case 'rigDown':
      hoursToAdd = 4; // 4 hours for rig down events
      break;
    default:
      hoursToAdd = 4; // fallback to 4 hours
  }
  
  const end = new Date(start.getTime() + (hoursToAdd * 60 * 60 * 1000));
  return end.toISOString();
};

/**
 * Smart team assignment that distributes bookings evenly across teams
 * Only assigns teams for NEW events, never overrides existing assignments
 */
const getNextTeamAssignment = async (supabase: any, eventType: string, eventDate: string, bookingId: string): Promise<string> => {
  // EVENT type events always go to team-11 (Live column)
  if (eventType === 'event') {
    console.log(`Assigning EVENT type to team-11 (Live) for booking ${bookingId}`);
    return 'team-11';
  }

  const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
  
  try {
    // Check existing events for this date to find the team with least events
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('resource_id')
      .eq('event_type', eventType)
      .gte('start_time', `${eventDate}T00:00:00`)
      .lt('start_time', `${eventDate}T23:59:59`);

    // Count events per team for this date and event type
    const teamCounts = new Map<string, number>();
    teams.forEach(team => teamCounts.set(team, 0));
    
    existingEvents?.forEach(event => {
      if (teams.includes(event.resource_id)) {
        teamCounts.set(event.resource_id, (teamCounts.get(event.resource_id) || 0) + 1);
      }
    });

    // Find the team with the least events
    let selectedTeam = teams[0];
    let minCount = teamCounts.get(selectedTeam) || 0;
    
    for (const team of teams) {
      const count = teamCounts.get(team) || 0;
      if (count < minCount) {
        minCount = count;
        selectedTeam = team;
      }
    }

    console.log(`Team distribution for ${eventDate} ${eventType}:`, Object.fromEntries(teamCounts));
    console.log(`Assigning booking ${bookingId} to ${selectedTeam} (has ${minCount} events)`);
    
    return selectedTeam;
  } catch (error) {
    console.error('Error calculating team assignment, falling back to round-robin:', error);
    // Fallback to simple round-robin based on booking position
    const bookingNumber = parseInt(bookingId.replace(/\D/g, ''), 10) || 0;
    const selectedTeam = teams[bookingNumber % teams.length];
    console.log(`Fallback assignment: booking ${bookingId} to ${selectedTeam}`);
    return selectedTeam;
  }
};

/**
 * Check if booking data has meaningfully changed
 */
const hasBookingChanged = (externalBooking: any, existingBooking: any): boolean => {
  const fields = [
    'client', 'rigdaydate', 'eventdate', 'rigdowndate', 'deliveryaddress',
    'delivery_city', 'delivery_postal_code', 'status', 'booking_number',
    'assigned_project_id', 'assigned_project_name', 'assigned_to_project'
  ];
  
  for (const field of fields) {
    const external = externalBooking[field] || '';
    const existing = existingBooking[field] || '';
    if (external !== existing) {
      console.log(`Field ${field} changed: "${existing}" -> "${external}"`);
      return true;
    }
  }
  
  return false;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { 
      quiet = false, 
      syncMode = 'incremental',
      historicalMode = false,
      forceHistoricalImport = false,
      startDate,
      endDate
    } = await req.json()
    
    const isHistoricalImport = historicalMode || forceHistoricalImport;
    
    console.log(`Starting import with sync mode: ${syncMode}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

    // Get API key from secrets
    const importApiKey = Deno.env.get('IMPORT_API_KEY')
    if (!importApiKey) {
      throw new Error('IMPORT_API_KEY not configured')
    }

    // Get the last sync timestamp for incremental sync (but not for historical)
    let lastSyncTimestamp = null;
    if (syncMode === 'incremental' && !isHistoricalImport) {
      const { data: syncState } = await supabase
        .from('sync_state')
        .select('last_sync_timestamp')
        .eq('sync_type', 'booking_import')
        .single()
      
      lastSyncTimestamp = syncState?.last_sync_timestamp;
      console.log(`Last sync timestamp: ${lastSyncTimestamp}`);
    } else if (isHistoricalImport) {
      console.log('HISTORICAL MODE: Ignoring last sync timestamp, will import all bookings');
    }

    // Update sync state to "in_progress" using UPSERT to avoid constraint violations
    const currentTimestamp = new Date().toISOString()
    const { error: syncStateError } = await supabase
      .from('sync_state')
      .upsert({
        sync_type: 'booking_import',
        last_sync_status: 'in_progress',
        last_sync_mode: syncMode,
        metadata: { 
          started_at: currentTimestamp,
          sync_mode: syncMode,
          filters: { startDate, endDate },
          historical_mode: isHistoricalImport
        },
        updated_at: currentTimestamp
      })

    if (syncStateError) {
      console.error('Error updating sync state:', syncStateError)
    }

    // Build API URL with timestamp filter for incremental sync
    let apiUrl = 'https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings';
    
    // For incremental sync (non-historical), use timestamp filtering
    if (syncMode === 'incremental' && lastSyncTimestamp && !isHistoricalImport) {
      const sinceDate = new Date(lastSyncTimestamp).toISOString();
      apiUrl += `?since=${encodeURIComponent(sinceDate)}`;
      console.log(`Fetching bookings modified since: ${sinceDate}`);
    }
    
    // For historical imports with date range
    if (isHistoricalImport && (startDate || endDate)) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) {
        apiUrl += `?${params.toString()}`;
        console.log(`Historical import with date range: ${startDate || 'beginning'} to ${endDate || 'end'}`);
      }
    }

    // Fetch bookings from export-bookings function
    const externalResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${importApiKey}`,
        'x-api-key': importApiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!externalResponse.ok) {
      throw new Error(`External API error: ${externalResponse.status}`)
    }

    const externalData = await externalResponse.json()
    console.log(`Fetched ${externalData.data?.length || 0} bookings from external API`)

    // Handle the response format from export-bookings function
    if (!externalData.data || !Array.isArray(externalData.data)) {
      throw new Error('Invalid external API response format - expected data array')
    }

    const results = {
      total: 0,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      warehouse_events_created: 0,
      packing_projects_created: 0,
      products_imported: 0,
      attachments_imported: 0,
      new_bookings: [],
      updated_bookings: [],
      status_changed_bookings: [],
      cancelled_bookings_skipped: [],
      duplicates_skipped: [],
      unchanged_bookings_skipped: [],
      errors: [],
      sync_mode: isHistoricalImport ? 'historical' : syncMode,
      team_distribution: {
        'team-1': 0,
        'team-2': 0,
        'team-3': 0,
        'team-4': 0,
        'team-5': 0,
        'team-11': 0
      }
    }

    // Get existing bookings for comparison
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, status, version, booking_number, client, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code')

    const existingBookingMap = new Map(existingBookings?.map(b => [b.id, b]) || [])
    const existingBookingNumberMap = new Map()
    
    // Build booking number map
    existingBookings?.forEach(booking => {
      if (booking.booking_number && booking.booking_number.trim() !== '') {
        existingBookingNumberMap.set(booking.booking_number.trim(), booking)
      }
    })

    console.log(`Found ${existingBookings?.length || 0} existing bookings in database`)

    for (const externalBooking of externalData.data) {
      try {
        results.total++

// Normalize status for consistent comparison
        const normalizeStatus = (status: string | null | undefined): string => {
          const s = (status || 'PENDING').toString().trim().toUpperCase();
          if (s === 'BEKRÄFTAD' || s === 'CONFIRMED') return 'CONFIRMED';
          if (s === 'AVBOKAD' || s === 'CANCELLED') return 'CANCELLED';
          return s;
        };

        const bookingStatus = normalizeStatus(externalBooking.status);

        // Check for existing booking FIRST (before deciding to skip CANCELLED)
        const existingById = existingBookingMap.get(externalBooking.id)
        let existingByNumber = null
        
        if (externalBooking.booking_number && externalBooking.booking_number.trim() !== '') {
          existingByNumber = existingBookingNumberMap.get(externalBooking.booking_number.trim())
        }

        const existingBooking = existingById || existingByNumber

        if (existingBooking && !existingById && existingByNumber) {
          console.log(`DUPLICATE DETECTED: Booking number ${externalBooking.booking_number} already exists with different ID. Skipping import of ${externalBooking.id}`)
          results.duplicates_skipped.push(externalBooking.id)
          continue
        }

        // Handle CANCELLED bookings - process if exists locally, skip if new
        if (bookingStatus === 'CANCELLED' && !isHistoricalImport) {
          if (existingBooking) {
            // Existing booking is now CANCELLED - we need to update and remove calendar events
            console.log(`CANCELLED booking ${externalBooking.id} exists locally → updating status and removing calendar events`)
            
            // Update booking status to CANCELLED
            const { error: updateError } = await supabase
              .from('bookings')
              .update({
                status: 'CANCELLED',
                version: (existingBooking.version || 1) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingBooking.id)
            
            if (updateError) {
              console.error(`Error updating CANCELLED booking:`, updateError)
              results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
              results.failed++
            } else {
              // Remove calendar events for this booking
              const { error: deleteCalError } = await supabase
                .from('calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deleteCalError) {
                console.error(`Error removing calendar events for CANCELLED booking:`, deleteCalError)
              } else {
                console.log(`Removed calendar events for CANCELLED booking ${existingBooking.id}`)
              }
              
              // Remove warehouse calendar events
              const { error: deleteWhError } = await supabase
                .from('warehouse_calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deleteWhError) {
                console.error(`Error removing warehouse events for CANCELLED booking:`, deleteWhError)
              } else {
                console.log(`Removed warehouse events for CANCELLED booking ${existingBooking.id}`)
              }
              
              results.status_changed_bookings.push(existingBooking.id)
              results.imported++
            }
            continue
          } else {
            // New CANCELLED booking - skip import
            console.log(`CANCELLED booking ${externalBooking.id} does not exist locally → skipping`)
            results.cancelled_bookings_skipped.push(externalBooking.id)
            continue
          }
        }

        // For historical imports, log but still process cancelled bookings
        if (bookingStatus === 'CANCELLED' && isHistoricalImport) {
          console.log(`Historical mode: Processing CANCELLED booking: ${externalBooking.id}`)
        }

        // Extract client name
        let clientName = externalBooking.clientName
        if (!clientName && externalBooking.client?.name) {
          clientName = externalBooking.client.name
        }
        if (!clientName) {
          clientName = ''
        }

        // Handle multiple date arrays - use first date from each array
        const rigdaydate = externalBooking.rig_up_dates && externalBooking.rig_up_dates.length > 0 
          ? externalBooking.rig_up_dates[0] 
          : undefined

        const eventdate = externalBooking.event_dates && externalBooking.event_dates.length > 0 
          ? externalBooking.event_dates[0] 
          : undefined

        const rigdowndate = externalBooking.rig_down_dates && externalBooking.rig_down_dates.length > 0 
          ? externalBooking.rig_down_dates[0] 
          : undefined

        const bookingData: BookingData = {
          id: externalBooking.id,
          client: clientName,
          rigdaydate: rigdaydate,
          eventdate: eventdate,
          rigdowndate: rigdowndate,
          deliveryaddress: externalBooking.delivery_address,
          delivery_city: externalBooking.delivery_city,
          delivery_postal_code: externalBooking.delivery_postal_code,
          delivery_latitude: externalBooking.delivery_geocode?.lat,
          delivery_longitude: externalBooking.delivery_geocode?.lng,
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          exact_time_info: externalBooking.exact_time_info,
          internalnotes: externalBooking.internal_notes,
          status: bookingStatus,
          booking_number: externalBooking.booking_number,
          version: 1,
          assigned_project_id: externalBooking.assigned_project_id,
          assigned_project_name: externalBooking.assigned_project_name,
          assigned_to_project: parseAssignedToProject(externalBooking.assigned_to_project)
        }

        console.log(`Processing booking ${bookingData.id} with status: ${bookingData.status} and project: ${bookingData.assigned_project_name || 'No project'}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

        if (existingBooking) {
          // EXISTING BOOKING - UPDATE ONLY IF ACTUALLY DIFFERENT
          console.log(`Found existing booking ${existingBooking.id}, checking for changes...`)
          
          const hasChanged = hasBookingChanged(bookingData, existingBooking);
          const statusChanged = existingBooking.status !== bookingData.status;
          
          // Check if this CONFIRMED booking is missing calendar events (recovery scenario)
          let needsCalendarRecovery = false;
          let needsWarehouseRecovery = false;
          let needsProductRecovery = false;
          
          if (bookingData.status === 'CONFIRMED') {
            const { data: existingCalEvents, error: calCheckError } = await supabase
              .from('calendar_events')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .limit(1);
            
            if (!calCheckError && (!existingCalEvents || existingCalEvents.length === 0)) {
              needsCalendarRecovery = true;
              console.log(`Booking ${bookingData.id} is CONFIRMED but has NO calendar events - will recover`);
            }
            
            // Check if warehouse events are missing or outdated
            const { data: existingWhEvents, error: whCheckError } = await supabase
              .from('warehouse_calendar_events')
              .select('id, source_rig_date, source_event_date, source_rigdown_date')
              .eq('booking_id', existingBooking.id)
              .limit(1);
            
            if (!whCheckError) {
              // Recovery needed if no warehouse events exist
              if (!existingWhEvents || existingWhEvents.length === 0) {
                needsWarehouseRecovery = true;
                console.log(`Booking ${bookingData.id} is CONFIRMED but has NO warehouse events - will recover`);
              } else {
                // Check if warehouse events have outdated source dates
                const whEvent = existingWhEvents[0];
                if (whEvent.source_rig_date !== bookingData.rigdaydate ||
                    whEvent.source_event_date !== bookingData.eventdate ||
                    whEvent.source_rigdown_date !== bookingData.rigdowndate) {
                  needsWarehouseRecovery = true;
                  console.log(`Booking ${bookingData.id} warehouse events have outdated dates - will recover`);
                }
              }
            }
            
            // Check if products need recovery (accessories missing parent_product_id)
            const { data: existingProducts, error: productCheckError } = await supabase
              .from('booking_products')
              .select('id, parent_product_id, name')
              .eq('booking_id', existingBooking.id);
            
            if (!productCheckError && existingProducts) {
              // Check if any accessory is missing parent_product_id
              const accessoriesWithoutParent = existingProducts.filter(
                p => isAccessoryProduct(p.name) && !p.parent_product_id
              );
              
              if (accessoriesWithoutParent.length > 0) {
                needsProductRecovery = true;
                console.log(`Booking ${bookingData.id} has ${accessoriesWithoutParent.length} accessories without parent_product_id - will recover`);
              }
              
              // Also recover if booking has no products but external data has products
              if (existingProducts.length === 0 && externalBooking.products && externalBooking.products.length > 0) {
                needsProductRecovery = true;
                console.log(`Booking ${bookingData.id} has NO products but external has ${externalBooking.products.length} - will recover`);
              }
            }
          }
          
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && !needsProductRecovery) {
            console.log(`No changes detected for ${bookingData.id}, skipping update`)
            results.unchanged_bookings_skipped.push(bookingData.id)
            continue; // SKIP UPDATE - NO CHANGES
          }
          
          // If only warehouse recovery is needed, sync now and continue
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && needsWarehouseRecovery && !needsProductRecovery) {
            console.log(`Only warehouse recovery needed for ${bookingData.id}`);
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
            results.warehouse_events_created += warehouseEventsCreated;
            results.imported++;
            continue;
          }
          
          // If only product recovery is needed, clear products and reimport
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && needsProductRecovery) {
            console.log(`Only product recovery needed for ${bookingData.id} - clearing and reimporting products`);
            await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id);
            
            // Process products with parent-child relationship tracking
            if (externalBooking.products && Array.isArray(externalBooking.products)) {
              console.log(`[Product Recovery] Processing ${externalBooking.products.length} products for booking ${bookingData.id}`)
              
              let lastParentProductId: string | null = null;
              
              for (const product of externalBooking.products) {
                try {
                  const unitPrice = product.price || product.unit_price || product.rental_price || product.cost || null;
                  const quantity = product.quantity || 1;
                  const totalPrice = unitPrice ? unitPrice * quantity : null;
                  const productName = product.name || product.product_name || 'Unknown Product';
                  const isAccessory = isAccessoryProduct(productName);
                  const isPkgComponent = isPackageComponent(product);
                  
                  console.log(`[Product Recovery] Product "${productName}": isAccessory=${isAccessory}, isPkgComponent=${isPkgComponent}, parentId=${isAccessory ? lastParentProductId : 'N/A'}`)
                  
                  // IMPORTANT: Do NOT use parent_product_id from external API - it references IDs in the source system
                  // which don't exist in our database. Only use lastParentProductId which we track locally.
                  const productData: ProductData = {
                    booking_id: existingBooking.id,
                    name: productName,
                    quantity: quantity,
                    notes: product.notes || product.description || null,
                    unit_price: unitPrice,
                    total_price: totalPrice,
                    parent_product_id: isAccessory && lastParentProductId ? lastParentProductId : undefined,
                    is_package_component: isPkgComponent || false,
                    // parent_package_id is stored as text (no FK constraint) so it's safe to store external IDs
                    parent_package_id: isPkgComponent ? (product.parent_package_id || null) : null,
                    sku: product.sku || product.inventory_item_type_id || product.article_number || null
                  }

                  const { data: insertedProduct, error: productError } = await supabase
                    .from('booking_products')
                    .insert(productData)
                    .select('id')
                    .single()

                  if (productError) {
                    console.error(`[Product Recovery] Error inserting product:`, productError)
                  } else {
                    results.products_imported++
                    
                    if (!isAccessory && !isPkgComponent && insertedProduct) {
                      lastParentProductId = insertedProduct.id;
                      console.log(`[Product Recovery] Set lastParentProductId to ${lastParentProductId} for "${productName}"`)
                    }
                  }
                } catch (productErr) {
                  console.error(`[Product Recovery] Error processing product:`, productErr)
                }
              }
            }
            
            results.imported++;
            results.updated_bookings.push(existingBooking.id);
            console.log(`[Product Recovery] Completed for booking ${bookingData.id}`);
            continue;
          }
          
          if (statusChanged) {
            console.log(`Status changed for ${bookingData.id}: ${existingBooking.status} -> ${bookingData.status}`)
            results.status_changed_bookings.push(bookingData.id)
            
            // CRITICAL: Handle status changes that affect calendar
            const wasConfirmed = existingBooking.status === 'CONFIRMED';
            const isNowConfirmed = bookingData.status === 'CONFIRMED';
            
            // If booking was confirmed but now isn't - REMOVE all calendar events
            if (wasConfirmed && !isNowConfirmed) {
              console.log(`Booking ${bookingData.id} is no longer CONFIRMED - removing calendar events`);
              
              // Remove from calendar_events
              const { error: deleteCalError } = await supabase
                .from('calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (deleteCalError) {
                console.error(`Error removing calendar events:`, deleteCalError);
              } else {
                console.log(`Removed calendar events for booking ${existingBooking.id}`);
              }
              
              // Remove from warehouse_calendar_events
              const { error: deleteWhError } = await supabase
                .from('warehouse_calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (deleteWhError) {
                console.error(`Error removing warehouse events:`, deleteWhError);
              } else {
                console.log(`Removed warehouse events for booking ${existingBooking.id}`);
              }
            }
            
            // If booking is now confirmed but wasn't before - calendar events will be created below
            if (!wasConfirmed && isNowConfirmed) {
              console.log(`Booking ${bookingData.id} is now CONFIRMED - calendar events will be created`);
            }
          } else {
            console.log(`Data changed for ${bookingData.id}, updating`)
            results.updated_bookings.push(bookingData.id)
          }

          // Update existing booking
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              ...bookingData,
              id: existingBooking.id,
              version: (existingBooking.version || 1) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingBooking.id)

          if (updateError) {
            console.error(`Error updating booking ${existingBooking.id}:`, updateError)
            results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
            results.failed++
            continue
          }

          // Only clear and recreate calendar events if booking data has MEANINGFULLY changed
          if (hasChanged) {
            console.log(`Recreating calendar events for changed booking ${existingBooking.id}`)
            // Clear existing calendar events
            await supabase
              .from('calendar_events')
              .delete()
              .eq('booking_id', existingBooking.id);
          }

          // Clear existing products and attachments for updated bookings
          await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id)
          await supabase.from('booking_attachments').delete().eq('booking_id', existingBooking.id)

          bookingData.id = existingBooking.id

        } else {
          // NEW BOOKING - Insert only if truly new
          console.log(`Inserting new booking ${bookingData.id}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)
          
          const { error: insertError } = await supabase
            .from('bookings')
            .insert(bookingData)

          if (insertError) {
            if (insertError.message.includes('duplicate key') || insertError.message.includes('already exists')) {
              console.log(`Duplicate booking detected during insert: ${bookingData.id}, skipping...`)
              results.duplicates_skipped.push(bookingData.id)
              continue
            }
            
            console.error(`Error inserting booking ${bookingData.id}:`, insertError)
            results.errors.push({ booking_id: bookingData.id, error: insertError.message })
            results.failed++
            continue
          }

          results.new_bookings.push(bookingData.id)
        }

        // Process products with parent-child relationship tracking
        if (externalBooking.products && Array.isArray(externalBooking.products)) {
          console.log(`Processing ${externalBooking.products.length} products for booking ${bookingData.id}`)
          
          // Track the last parent product ID for linking accessories
          let lastParentProductId: string | null = null;
          
          for (const product of externalBooking.products) {
            try {
              // Log raw product data to see all available fields from external API
              console.log(`RAW PRODUCT DATA from external API for booking ${bookingData.id}:`, JSON.stringify(product, null, 2))
              
              // Extract price data - try multiple possible field names
              const unitPrice = product.price || product.unit_price || product.rental_price || product.cost || null;
              const quantity = product.quantity || 1;
              const totalPrice = unitPrice ? unitPrice * quantity : null;
              const productName = product.name || product.product_name || 'Unknown Product';
              
              // Check if this is an accessory (starts with ↳, └, etc.) OR a package component
              const isAccessory = isAccessoryProduct(productName);
              const isPkgComponent = isPackageComponent(product);
              
              // Log package component detection
              if (isPkgComponent) {
                console.log(`[PACKAGE COMPONENT] "${productName}": parent_package_id=${product.parent_package_id}`)
              }
              
              console.log(`Product "${productName}": unit_price=${unitPrice}, quantity=${quantity}, total_price=${totalPrice}, isAccessory=${isAccessory}, isPkgComponent=${isPkgComponent}, parentId=${isAccessory ? lastParentProductId : 'N/A'}`)
              
              // IMPORTANT: Do NOT use parent_product_id from external API - it references IDs in the source system
              // which don't exist in our database. Only use lastParentProductId which we track locally.
              const productData: ProductData = {
                booking_id: bookingData.id,
                name: productName,
                quantity: quantity,
                notes: product.notes || product.description || null,
                unit_price: unitPrice,
                total_price: totalPrice,
                parent_product_id: isAccessory && lastParentProductId ? lastParentProductId : undefined,
                is_package_component: isPkgComponent || false,
                // parent_package_id is stored as text (no FK constraint) so it's safe to store external IDs
                parent_package_id: isPkgComponent ? (product.parent_package_id || null) : null,
                sku: product.sku || product.inventory_item_type_id || product.article_number || null
              }

              const { data: insertedProduct, error: productError } = await supabase
                .from('booking_products')
                .insert(productData)
                .select('id')
                .single()

              if (productError) {
                console.error(`Error inserting product for booking ${bookingData.id}:`, productError)
              } else {
                results.products_imported++
                
                // If this is a parent product (not an accessory and not a package component), store its ID for subsequent accessories
                if (!isAccessory && !isPkgComponent && insertedProduct) {
                  lastParentProductId = insertedProduct.id;
                  console.log(`Set lastParentProductId to ${lastParentProductId} for product "${productName}"`)
                }
              }
            } catch (productErr) {
              console.error(`Error processing product for booking ${bookingData.id}:`, productErr)
            }
          }
        }

        // Process attachments
        if (externalBooking.attachments && Array.isArray(externalBooking.attachments)) {
          console.log(`Processing ${externalBooking.attachments.length} attachments for booking ${bookingData.id}`)
          
          for (const attachment of externalBooking.attachments) {
            try {
              const attachmentData: AttachmentData = {
                booking_id: bookingData.id,
                url: attachment.url || attachment.file_url,
                file_name: attachment.file_name || attachment.name || 'Unknown File',
                file_type: attachment.file_type || attachment.type || 'unknown'
              }

              const { error: attachmentError } = await supabase
                .from('booking_attachments')
                .insert(attachmentData)

              if (attachmentError) {
                console.error(`Error inserting attachment for booking ${bookingData.id}:`, attachmentError)
              } else {
                results.attachments_imported++
              }
            } catch (attachmentErr) {
              console.error(`Error processing attachment for booking ${bookingData.id}:`, attachmentErr)
            }
          }
        }

        results.imported++

        // SMART CALENDAR EVENT HANDLING - CREATE EVENTS FOR ALL CONFIRMED BOOKINGS (INCLUDING HISTORICAL)
        if (bookingData.status === 'CONFIRMED') {
          // Check if calendar events already exist for this booking
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('id, event_type, start_time, booking_id, resource_id')
            .eq('booking_id', bookingData.id)

          const existingEventTypes = new Set(existingEvents?.map(e => e.event_type) || [])
          console.log(`Found ${existingEvents?.length || 0} existing calendar events for booking ${bookingData.id}`)

          const calendarEvents = []
          
          // Only create events that don't already exist OR that aren't manually assigned
          if (bookingData.rigdaydate && !existingEventTypes.has('rig')) {
            const startTime = `${bookingData.rigdaydate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rig')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rig',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.rigdaydate
            })
          }

          if (bookingData.eventdate && !existingEventTypes.has('event')) {
            const startTime = `${bookingData.eventdate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'event')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'event',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.eventdate
            })
          }

          if (bookingData.rigdowndate && !existingEventTypes.has('rigDown')) {
            const startTime = `${bookingData.rigdowndate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rigDown')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rigDown',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.rigdowndate
            })
          }

          if (calendarEvents.length > 0) {
            console.log(`Creating ${calendarEvents.length} new calendar events for booking ${bookingData.id}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

            // Use smart team assignment for each event
            for (const event of calendarEvents) {
              const assignedTeam = await getNextTeamAssignment(supabase, event.event_type, event.date, bookingData.id);
              
              // Track team distribution
              if (results.team_distribution[assignedTeam] !== undefined) {
                results.team_distribution[assignedTeam]++;
              }

              console.log(`Assigning ${event.event_type} event to ${assignedTeam} for booking ${bookingData.id} on ${event.date}`);

              const { error: eventError } = await supabase
                .from('calendar_events')
                .upsert({
                  booking_id: event.booking_id,
                  booking_number: event.booking_number,
                  title: event.title,
                  start_time: event.start_time,
                  end_time: event.end_time,
                  event_type: event.event_type,
                  delivery_address: event.delivery_address,
                  resource_id: assignedTeam
                })

              if (eventError) {
                console.error(`Error creating calendar event:`, eventError)
              } else {
                results.calendar_events_created++
              }
            }
          } else {
            console.log(`No new calendar events needed for booking ${bookingData.id}`)
          }
          
          // Sync warehouse calendar events for confirmed bookings with dates
          if (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate) {
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
            results.warehouse_events_created += warehouseEventsCreated;
          }
          
          // Create packing project for confirmed bookings
          const packingCreated = await createPackingForBooking(supabase, bookingData);
          if (packingCreated) {
            results.packing_projects_created++;
          }
        }

      } catch (error) {
        console.error(`Error processing booking ${externalBooking.id}:`, error)
        results.errors.push({ booking_id: externalBooking.id, error: error.message })
        results.failed++
      }
    }

    // SAVE SYNC TIMESTAMP using UPSERT - but only for non-historical imports
    const finalTimestamp = new Date().toISOString()
    console.log(`Saving sync timestamp: ${finalTimestamp}`)
    console.log(`Team distribution summary:`, results.team_distribution)
    console.log(`Unchanged bookings skipped: ${results.unchanged_bookings_skipped.length}`)
    
    // Only update sync timestamp for non-historical imports
    if (!isHistoricalImport) {
      const { error: syncError } = await supabase
        .from('sync_state')
        .upsert({
          sync_type: 'booking_import',
          last_sync_timestamp: finalTimestamp,
          last_sync_mode: syncMode,
          last_sync_status: results.failed > 0 ? 'partial_success' : 'success',
          metadata: { results },
          updated_at: finalTimestamp
        })

      if (syncError) {
        console.error('Error saving sync state:', syncError)
      } else {
        console.log('Sync timestamp saved successfully')
      }
    } else {
      console.log('Historical import: NOT updating sync timestamp to preserve incremental sync state')
    }

    console.log('Import results:', {
      total: results.total,
      imported: results.imported,
      new_bookings: results.new_bookings.length,
      updated_bookings: results.updated_bookings.length,
      unchanged_skipped: results.unchanged_bookings_skipped.length,
      duplicates_skipped: results.duplicates_skipped.length,
      cancelled_skipped: results.cancelled_bookings_skipped.length,
      calendar_events_created: results.calendar_events_created,
      warehouse_events_created: results.warehouse_events_created,
      packing_projects_created: results.packing_projects_created,
      team_distribution: results.team_distribution,
      mode: isHistoricalImport ? 'HISTORICAL' : syncMode
    })

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        results: {
          total: 0,
          imported: 0,
          failed: 0,
          calendar_events_created: 0,
          warehouse_events_created: 0,
          products_imported: 0,
          attachments_imported: 0,
          new_bookings: [],
          updated_bookings: [],
          status_changed_bookings: [],
          cancelled_bookings_skipped: [],
          duplicates_skipped: [],
          unchanged_bookings_skipped: [],
          errors: [error.message],
          sync_mode: 'failed',
          team_distribution: {}
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
