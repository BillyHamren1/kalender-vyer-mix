import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { type, record, old_record } = body

    // Determine notification type and build payload
    const table = record ? (body.table || '') : ''
    
    console.log(`Push trigger: type=${type}, table=${table}`)

    if (table === 'direct_messages' && type === 'INSERT') {
      await handleDirectMessage(supabase, record)
    } else if (table === 'broadcast_messages' && type === 'INSERT') {
      await handleBroadcast(supabase, record)
    } else if (table === 'booking_staff_assignments' && type === 'INSERT') {
      await handleNewAssignment(supabase, record)
    } else if (table === 'bookings' && type === 'UPDATE') {
      await handleScheduleChange(supabase, record, old_record)
    } else if (table === 'job_messages' && type === 'INSERT') {
      await handleJobMessage(supabase, record)
    } else {
      console.log(`Unhandled trigger: ${table} ${type}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Push trigger error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function sendPush(supabase: any, staffIds: string[], title: string, body: string, notificationType: string, organizationId: string, data?: Record<string, string>) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        staff_ids: staffIds,
        title,
        body,
        notification_type: notificationType,
        data,
        organization_id: organizationId,
      }),
    })
    
    const result = await res.json()
    console.log(`Push result: sent=${result.sent}, failed=${result.failed}`)
  } catch (err) {
    console.error('Failed to call send-push-notification:', err)
  }
}

async function handleDirectMessage(supabase: any, record: any) {
  const senderName = record.sender_name || 'Planerare'
  const content = record.content?.substring(0, 100) || ''
  const recipientId = record.recipient_id
  const organizationId = record.organization_id

  await sendPush(
    supabase,
    [recipientId],
    `Meddelande från ${senderName}`,
    content,
    'message',
    organizationId,
    { sender_id: record.sender_id, message_type: 'direct' }
  )
}

async function handleBroadcast(supabase: any, record: any) {
  const category = record.category || 'info'
  const content = record.content?.substring(0, 100) || ''
  const audience = record.audience
  const organizationId = record.organization_id
  
  const categoryLabels: Record<string, string> = {
    weather: '🌧️ Vädervarning',
    urgent: '🚨 Brådskande',
    schedule: '📅 Schemauppdatering',
    logistics: '🚛 Logistikmeddelande',
    info: 'ℹ️ Meddelande',
  }
  
  const title = categoryLabels[category] || 'Meddelande från Operations'

  let staffIds: string[] = []

  if (audience === 'selected_staff' && record.audience_staff_ids) {
    staffIds = record.audience_staff_ids
  } else if (audience === 'job_staff' && record.audience_booking_id) {
    const { data: assignments } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .eq('booking_id', record.audience_booking_id)
      .eq('organization_id', organizationId)
    staffIds = [...new Set((assignments || []).map((a: any) => a.staff_id))]
  } else {
    // all_today or active_staff - get all staff with device tokens
    const today = new Date().toISOString().split('T')[0]
    const { data: assignments } = await supabase
      .from('staff_assignments')
      .select('staff_id')
      .eq('assignment_date', today)
      .eq('organization_id', organizationId)
    staffIds = [...new Set((assignments || []).map((a: any) => a.staff_id))]
  }

  if (staffIds.length > 0) {
    await sendPush(supabase, staffIds, title, content, 'broadcast', organizationId, {
      broadcast_id: record.id,
      category,
    })
  }
}

async function handleNewAssignment(supabase: any, record: any) {
  const staffId = record.staff_id
  const bookingId = record.booking_id
  const organizationId = record.organization_id
  const date = record.assignment_date

  // Get booking info
  const { data: booking } = await supabase
    .from('bookings')
    .select('client, booking_number')
    .eq('id', bookingId)
    .single()

  const clientName = booking?.client || 'Okänt jobb'
  const bookingNum = booking?.booking_number ? ` #${booking.booking_number}` : ''

  await sendPush(
    supabase,
    [staffId],
    `Nytt uppdrag${bookingNum}`,
    `${clientName} – ${date}`,
    'assignment',
    organizationId,
    { booking_id: bookingId, date }
  )
}

async function handleScheduleChange(supabase: any, record: any, oldRecord: any) {
  if (!oldRecord) return
  
  const organizationId = record.organization_id
  
  // Check if relevant schedule fields changed
  const scheduleFields = ['rigdaydate', 'eventdate', 'rigdowndate', 'rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time', 'rigdown_start_time', 'rigdown_end_time']
  const changed = scheduleFields.some(f => record[f] !== oldRecord[f])
  
  if (!changed) return

  // Get staff assigned to this booking
  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id')
    .eq('booking_id', record.id)
    .eq('organization_id', organizationId)

  const staffIds = [...new Set((assignments || []).map((a: any) => a.staff_id))]
  
  if (staffIds.length === 0) return

  const clientName = record.client || 'Jobb'
  const bookingNum = record.booking_number ? ` #${record.booking_number}` : ''

  await sendPush(
    supabase,
    staffIds,
    `Schema uppdaterat${bookingNum}`,
    `${clientName} har uppdaterade tider`,
    'schedule',
    organizationId,
    { booking_id: record.id }
  )
}

async function handleJobMessage(supabase: any, record: any) {
  const senderName = record.sender_name || 'Planerare'
  const content = record.content?.substring(0, 100) || ''
  const bookingId = record.booking_id
  const organizationId = record.organization_id
  const senderId = record.sender_id

  // Get staff assigned to this booking (exclude sender)
  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  const staffIds = [...new Set((assignments || []).map((a: any) => a.staff_id))]
    .filter(id => id !== senderId)
  
  if (staffIds.length === 0) return

  await sendPush(
    supabase,
    staffIds,
    `Jobbchatt – ${senderName}`,
    content,
    'message',
    organizationId,
    { booking_id: bookingId, message_type: 'job' }
  )
}
