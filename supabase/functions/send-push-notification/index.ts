import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushPayload {
  staff_ids: string[]
  title: string
  body: string
  notification_type: 'message' | 'assignment' | 'schedule' | 'broadcast'
  data?: Record<string, string>
  organization_id: string
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  // Create JWT for Google OAuth2
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const claimSet = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  
  const signInput = `${header}.${claimSet}`
  
  // Import the private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  )
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  
  const jwt = `${header}.${claimSet}.${encodedSignature}`
  
  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }
  
  return tokenData.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const firebaseKeyJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')
    if (!firebaseKeyJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured')
    }

    const serviceAccount = JSON.parse(firebaseKeyJson)
    const accessToken = await getAccessToken(serviceAccount)
    const projectId = serviceAccount.project_id

    const payload: PushPayload = await req.json()
    const { staff_ids, title, body, notification_type, data, organization_id } = payload

    // Get device tokens for the target staff
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token, staff_id, platform')
      .in('staff_id', staff_ids)
      .eq('organization_id', organization_id)

    if (tokenError) {
      throw new Error(`Failed to fetch device tokens: ${tokenError.message}`)
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No device tokens found for staff: ${staff_ids.join(', ')}`)
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No device tokens registered' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending push to ${tokens.length} devices for ${staff_ids.length} staff`)

    let successCount = 0
    let failCount = 0

    for (const deviceToken of tokens) {
      try {
        const message: any = {
          message: {
            token: deviceToken.token,
            notification: { title, body },
            data: {
              notification_type,
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
              ...data,
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'eventflow_notifications',
                sound: 'default',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          },
        }

        const fcmRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }
        )

        const fcmData = await fcmRes.json()

        if (fcmRes.ok) {
          successCount++
        } else {
          failCount++
          console.error(`FCM error for token ${deviceToken.token.slice(0, 10)}...:`, fcmData)
          
          // Remove invalid tokens
          if (fcmData?.error?.code === 404 || fcmData?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
            await supabase.from('device_tokens').delete().eq('token', deviceToken.token)
            console.log(`Removed invalid token: ${deviceToken.token.slice(0, 10)}...`)
          }
        }

        // Log the notification
        await supabase.from('push_notification_log').insert({
          staff_id: deviceToken.staff_id,
          title,
          body,
          notification_type,
          data: data || {},
          success: fcmRes.ok,
          error_message: fcmRes.ok ? null : JSON.stringify(fcmData),
          organization_id,
        })
      } catch (err) {
        failCount++
        console.error(`Error sending to device:`, err)
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Push notification error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
