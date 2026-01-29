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

interface ProductData {
  booking_id: string;
  name: string;
  quantity: number;
  notes?: string;
}

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
  // EVENT type events always go to team-6
  if (eventType === 'event') {
    console.log(`Assigning EVENT type to team-6 for booking ${bookingId}`);
    return 'team-6';
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
        'team-6': 0
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
          }
          
          if (!hasChanged && !statusChanged && !needsCalendarRecovery) {
            console.log(`No changes detected for ${bookingData.id}, skipping update`)
            results.unchanged_bookings_skipped.push(bookingData.id)
            continue; // SKIP UPDATE - NO CHANGES
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

        // Process products
        if (externalBooking.products && Array.isArray(externalBooking.products)) {
          console.log(`Processing ${externalBooking.products.length} products for booking ${bookingData.id}`)
          
          for (const product of externalBooking.products) {
            try {
              const productData: ProductData = {
                booking_id: bookingData.id,
                name: product.name || product.product_name || 'Unknown Product',
                quantity: product.quantity || 1,
                notes: product.notes || product.description || null
              }

              const { error: productError } = await supabase
                .from('booking_products')
                .insert(productData)

              if (productError) {
                console.error(`Error inserting product for booking ${bookingData.id}:`, productError)
              } else {
                results.products_imported++
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
