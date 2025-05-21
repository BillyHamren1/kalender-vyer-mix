
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Function to send webhook notification
async function sendWebhookNotification(webhook, payload) {
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': generateSignature(payload, webhook.secret_key),
        'X-Webhook-ID': webhook.id,
        'X-Webhook-Timestamp': new Date().toISOString()
      },
      body: JSON.stringify(payload)
    })

    const status = response.status
    const text = await response.text()

    return {
      success: status >= 200 && status < 300,
      status,
      response: text,
    }
  } catch (error) {
    console.error(`Error sending webhook to ${webhook.url}:`, error)
    return {
      success: false,
      error: error.message
    }
  }
}

// Function to generate a signature for webhook verification
function generateSignature(payload, secret) {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(payload))
  const keyData = encoder.encode(secret)
  
  // This requires Deno Deploy environment
  return "sha256=" + Array.from(
    new Uint8Array(
      // @ts-ignore: Deno crypto API
      crypto.subtle.digestSync("SHA-256", 
        // @ts-ignore: Deno crypto API
        crypto.subtle.hmacSignSync("SHA-256", keyData, data)
      )
    )
  ).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Function to update webhook's last triggered timestamp
async function updateWebhookTimestamp(webhookId) {
  const { error } = await supabase
    .from('webhook_subscriptions')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', webhookId)
  
  if (error) {
    console.error('Error updating webhook timestamp:', error)
  }
}

// Handle booking change events
async function handleBookingChange(booking, changeType, changeDetails) {
  // Find all active webhooks subscribed to this event type
  const { data: webhooks, error } = await supabase
    .from('webhook_subscriptions')
    .select('*')
    .eq('is_active', true)
    .contains('events', [changeType])
  
  if (error) {
    console.error('Error fetching webhooks:', error)
    return { success: false, error: 'Failed to fetch webhooks' }
  }
  
  if (!webhooks || webhooks.length === 0) {
    return { success: true, message: 'No active webhooks found for this event type' }
  }
  
  const results = []
  
  // Send notification to each webhook
  for (const webhook of webhooks) {
    const payload = {
      event: changeType,
      booking_id: booking.id,
      timestamp: new Date().toISOString(),
      data: {
        booking,
        changes: changeDetails
      }
    }
    
    const result = await sendWebhookNotification(webhook, payload)
    results.push({
      webhook_id: webhook.id,
      webhook_name: webhook.name,
      ...result
    })
    
    if (result.success) {
      await updateWebhookTimestamp(webhook.id)
    }
  }
  
  return {
    success: true,
    results
  }
}

// Main server function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Parse the request body
    const { action, booking_id, webhook_id, change_type, change_details } = await req.json()
    
    // Handle test webhook
    if (action === 'test' && webhook_id) {
      const { data: webhook, error } = await supabase
        .from('webhook_subscriptions')
        .select('*')
        .eq('id', webhook_id)
        .single()
      
      if (error || !webhook) {
        return new Response(
          JSON.stringify({ success: false, error: 'Webhook not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }
      
      const testPayload = {
        event: 'test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test notification',
          webhook_id: webhook.id,
          webhook_name: webhook.name
        }
      }
      
      const result = await sendWebhookNotification(webhook, testPayload)
      
      if (result.success) {
        await updateWebhookTimestamp(webhook.id)
      }
      
      return new Response(
        JSON.stringify({ success: result.success, result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Handle booking change notifications
    if (booking_id && change_type) {
      // Fetch the booking details
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking_id)
        .single()
      
      if (error || !booking) {
        return new Response(
          JSON.stringify({ success: false, error: 'Booking not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }
      
      const result = await handleBookingChange(booking, change_type, change_details)
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  } catch (error) {
    console.error('Error processing webhook notification request:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
