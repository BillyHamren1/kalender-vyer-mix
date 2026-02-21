
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

async function resolveOrganizationId(explicitOrgId?: string): Promise<string | undefined> {
  if (explicitOrgId) {
    const { data } = await supabase.from('organizations').select('id').eq('id', explicitOrgId).single()
    if (!data) throw new Error(`Organization not found: ${explicitOrgId}`)
    return data.id
  }
  console.warn('[time-reports] DEPRECATION WARNING: organization_id not provided, falling back to first org.')
  const { data } = await supabase.from('organizations').select('id').limit(1).single()
  return data?.id
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const method = req.method
    const pathSegments = url.pathname.split('/').filter(Boolean)
    
    console.log(`Time Reports API: ${method} ${url.pathname}`)
    
    if (method === 'GET') {
      // GET /time-reports - Fetch time reports with optional filters
      if (pathSegments.length === 1) {
        const staffId = url.searchParams.get('staff_id')
        const bookingId = url.searchParams.get('booking_id')
        const startDate = url.searchParams.get('start_date')
        const endDate = url.searchParams.get('end_date')
        
        let query = supabase
          .from('time_reports')
          .select(`
            *,
            staff_members!inner(id, name, hourly_rate, overtime_rate),
            bookings!inner(id, client, booking_number)
          `)
          .order('report_date', { ascending: false })
        
        if (staffId) query = query.eq('staff_id', staffId)
        if (bookingId) query = query.eq('booking_id', bookingId)
        if (startDate) query = query.gte('report_date', startDate)
        if (endDate) query = query.lte('report_date', endDate)
        
        const { data, error } = await query
        
        if (error) {
          console.error('Error fetching time reports:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      // GET /time-reports/summary - Get aggregated data for finished jobs
      if (pathSegments[1] === 'summary') {
        const { data: finishedBookings, error: bookingsError } = await supabase
          .from('bookings')
          .select(`
            id,
            client,
            booking_number,
            status,
            rigdaydate,
            eventdate,
            rigdowndate
          `)
          .in('status', ['COMPLETED', 'FINISHED'])
          .order('eventdate', { ascending: false })
        
        if (bookingsError) {
          console.error('Error fetching finished bookings:', bookingsError)
          return new Response(JSON.stringify({ error: bookingsError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Get time reports for each finished booking
        const bookingIds = finishedBookings.map(b => b.id)
        
        const { data: timeReports, error: reportsError } = await supabase
          .from('time_reports')
          .select(`
            *,
            staff_members!inner(id, name, hourly_rate, overtime_rate)
          `)
          .in('booking_id', bookingIds)
        
        if (reportsError) {
          console.error('Error fetching time reports for summary:', reportsError)
          return new Response(JSON.stringify({ error: reportsError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Calculate costs for each booking
        const bookingSummaries = finishedBookings.map(booking => {
          const bookingReports = timeReports.filter(report => report.booking_id === booking.id)
          
          let totalHours = 0
          let totalCost = 0
          let totalOvertimeCost = 0
          
          const staffBreakdown = bookingReports.reduce((acc, report) => {
            const staffId = report.staff_id
            const staff = report.staff_members
            
            if (!acc[staffId]) {
              acc[staffId] = {
                staff_name: staff.name,
                total_hours: 0,
                overtime_hours: 0,
                regular_cost: 0,
                overtime_cost: 0,
                total_cost: 0,
                reports: []
              }
            }
            
            const regularHours = report.hours_worked - (report.overtime_hours || 0)
            const overtimeHours = report.overtime_hours || 0
            const regularCost = regularHours * (staff.hourly_rate || 0)
            const overtimeCost = overtimeHours * (staff.overtime_rate || staff.hourly_rate || 0)
            
            acc[staffId].total_hours += report.hours_worked
            acc[staffId].overtime_hours += overtimeHours
            acc[staffId].regular_cost += regularCost
            acc[staffId].overtime_cost += overtimeCost
            acc[staffId].total_cost += regularCost + overtimeCost
            acc[staffId].reports.push(report)
            
            totalHours += report.hours_worked
            totalCost += regularCost
            totalOvertimeCost += overtimeCost
            
            return acc
          }, {})
          
          return {
            ...booking,
            total_hours: totalHours,
            total_cost: totalCost + totalOvertimeCost,
            regular_cost: totalCost,
            overtime_cost: totalOvertimeCost,
            staff_breakdown: Object.values(staffBreakdown)
          }
        })
        
        return new Response(JSON.stringify({ data: bookingSummaries }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }
    
    if (method === 'POST') {
      // POST /time-reports - Create new time report
      const body = await req.json()
      
      // Ensure organization_id is set for multi-tenant
      if (!body.organization_id) {
        body.organization_id = await resolveOrganizationId()
      }
      
      const { data, error } = await supabase
        .from('time_reports')
        .insert(body)
        .select(`
          *,
          staff_members!inner(name),
          bookings!inner(client, booking_number)
        `)
        .single()
      
      if (error) {
        console.error('Error creating time report:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (method === 'PUT') {
      // PUT /time-reports/{id} - Update time report
      const reportId = pathSegments[1]
      const body = await req.json()
      
      const { data, error } = await supabase
        .from('time_reports')
        .update(body)
        .eq('id', reportId)
        .select(`
          *,
          staff_members!inner(name),
          bookings!inner(client, booking_number)
        `)
        .single()
      
      if (error) {
        console.error('Error updating time report:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (method === 'DELETE') {
      // DELETE /time-reports/{id} - Delete time report
      const reportId = pathSegments[1]
      
      const { error } = await supabase
        .from('time_reports')
        .delete()
        .eq('id', reportId)
      
      if (error) {
        console.error('Error deleting time report:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Time Reports API Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
