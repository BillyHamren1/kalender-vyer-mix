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
    
    const rawText = await res.text()
    console.log(`[sendPush] HTTP ${res.status}, raw response: ${rawText}`)
    
    try {
      const result = JSON.parse(rawText)
      if (res.ok) {
        console.log(`Push result: sent=${result.sent ?? 0}, failed=${result.failed ?? 0}`)
      } else {
        console.error(`Push send failed: ${result.error || rawText}`)
      }
    } catch {
      console.error(`Push response not JSON: ${rawText}`)
    }
  } catch (err) {
    console.error('Failed to call send-push-notification:', err)
  }
}

async function handleDirectMessage(supabase: any, record: any) {
  const senderName = record.sender_name || 'Planerare'
  const content = record.content?.substring(0, 100) || ''
  const recipientId = record.recipient_id
  let organizationId = record.organization_id

  console.log(`[DM Push Trigger] sender=${record.sender_id}, recipient=${recipientId}, org=${organizationId}`)

  // If org_id is missing from webhook payload, resolve it
  if (!organizationId) {
    // Try 1: read from direct_messages table (service_role bypasses RLS)
    const { data: dmRow } = await supabase
      .from('direct_messages')
      .select('organization_id')
      .eq('id', record.id)
      .single()
    organizationId = dmRow?.organization_id || ''
    if (organizationId) {
      console.log(`[DM Push Trigger] resolved org_id from direct_messages table: ${organizationId}`)
    }
  }

  if (!organizationId) {
    // Try 2: from device_tokens
    const { data: token } = await supabase
      .from('device_tokens')
      .select('organization_id')
      .eq('staff_id', recipientId)
      .limit(1)
      .single()
    organizationId = token?.organization_id || ''
    if (organizationId) {
      console.log(`[DM Push Trigger] resolved org_id from device_tokens: ${organizationId}`)
    }
  }

  if (!organizationId) {
    // Try 3: from profiles (sender is likely authenticated user)
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', record.sender_id)
      .single()
    organizationId = profile?.organization_id || ''
    if (organizationId) {
      console.log(`[DM Push Trigger] resolved org_id from profiles: ${organizationId}`)
    }
  }

  if (!organizationId) {
    console.log(`[DM Push Trigger] no organization_id found after all fallbacks, skipping push`)
    return
  }

  await sendPush(
    supabase,
    [recipientId],
    `Meddelande från ${senderName}`,
    content,
    'message',
    organizationId,
    { sender_id: record.sender_id, chat_type: 'direct' }
  )
}
...
  await sendPush(
    supabase,
    staffIds,
    `Jobbchatt – ${senderName}`,
    content,
    'message',
    organizationId,
    { booking_id: bookingId, chat_type: 'job' }
  )
}
