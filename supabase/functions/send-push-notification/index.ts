// @ts-nocheck
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

function sanitizeDataPayload(data?: Record<string, unknown>): Record<string, string> {
  if (!data) return {}

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => /^[a-zA-Z0-9_]+$/.test(key) && value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)])
  )
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

    let firebaseKeyRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')
    if (!firebaseKeyRaw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured')
    }

    // Debug: log raw shape to diagnose secrets manager escaping
    console.log(`[FCM] Secret raw length=${firebaseKeyRaw.length}, first20=${JSON.stringify(firebaseKeyRaw.slice(0, 20))}, last20=${JSON.stringify(firebaseKeyRaw.slice(-20))}`)

    // Aggressively unwrap: secrets manager may double-quote, triple-escape, etc.
    let serviceAccount: any = null
    let parseAttempts: string[] = []

    // Attempt 1: parse as-is
    try {
      serviceAccount = JSON.parse(firebaseKeyRaw)
      parseAttempts.push('direct: OK')
    } catch (e) {
      parseAttempts.push(`direct: ${e.message}`)
    }

    // Attempt 2: if result is a string (double-encoded), parse again
    if (typeof serviceAccount === 'string') {
      try {
        serviceAccount = JSON.parse(serviceAccount)
        parseAttempts.push('double-decode: OK')
      } catch (e) {
        parseAttempts.push(`double-decode: ${e.message}`)
        serviceAccount = null
      }
    }

    // Attempt 3: strip outer quotes and unescape
    if (!serviceAccount || typeof serviceAccount !== 'object') {
      let cleaned = firebaseKeyRaw.trim()
      // Strip wrapping quotes
      while (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1)
      }
      // Unescape common patterns
      cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      try {
        serviceAccount = JSON.parse(cleaned)
        parseAttempts.push('cleaned: OK')
      } catch (e) {
        parseAttempts.push(`cleaned: ${e.message}`)
      }
    }

    // Attempt 4: regex extract the JSON object
    if (!serviceAccount || typeof serviceAccount !== 'object') {
      const match = firebaseKeyRaw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          serviceAccount = JSON.parse(match[0])
          parseAttempts.push('regex-extract: OK')
        } catch (e) {
          parseAttempts.push(`regex-extract: ${e.message}`)
        }
      }
    }

    console.log(`[FCM] Parse attempts: ${parseAttempts.join(' | ')}`)

    if (!serviceAccount || typeof serviceAccount !== 'object') {
      console.error('[FCM] All parse attempts failed. First 200 chars:', firebaseKeyRaw.slice(0, 200))
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as JSON after multiple attempts')
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      console.error('[FCM] Service account missing required fields. Has client_email:', !!serviceAccount.client_email, 'private_key:', !!serviceAccount.private_key, 'project_id:', !!serviceAccount.project_id)
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing required fields')
    }

    console.log(`[FCM] Using project: ${serviceAccount.project_id}, email: ${serviceAccount.client_email}`)

    const accessToken = await getAccessToken(serviceAccount)
    const projectId = serviceAccount.project_id

    const payload: PushPayload = await req.json()
    const { staff_ids, title, body, notification_type, data, organization_id } = payload
    const safeData = sanitizeDataPayload(data)

    // Get device tokens for the target staff
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token, staff_id, platform, last_refreshed_at')
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
              ...safeData,
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

          // Remove invalid tokens — broaden detection to all FCM signals
          // that mean "this token will never deliver again".
          const errCode = fcmData?.error?.code
          const errStatus = fcmData?.error?.status
          const errorCode = fcmData?.error?.details?.[0]?.errorCode
          const isUnregistered = errorCode === 'UNREGISTERED' || errCode === 404
          const isInvalidArgument =
            errStatus === 'INVALID_ARGUMENT' ||
            errCode === 400 ||
            errorCode === 'INVALID_ARGUMENT'

          if (isUnregistered || isInvalidArgument) {
            const ageDays = deviceToken.last_refreshed_at
              ? Math.round((Date.now() - new Date(deviceToken.last_refreshed_at).getTime()) / (24 * 60 * 60 * 1000))
              : -1
            await supabase.from('device_tokens').delete().eq('token', deviceToken.token)
            console.log(
              `[FCM] stale_token_purged staff=${deviceToken.staff_id} reason=${isUnregistered ? 'UNREGISTERED' : 'INVALID_ARGUMENT'} age_days=${ageDays} prefix=${deviceToken.token.slice(0, 10)}`
            )
          }
        }

        // Log the notification (non-fatal if table doesn't exist)
        try {
          await supabase.from('push_notification_log').insert({
            staff_id: deviceToken.staff_id,
            title,
            body,
            notification_type,
             data: safeData,
            success: fcmRes.ok,
            error_message: fcmRes.ok ? null : JSON.stringify(fcmData),
            organization_id,
          })
        } catch (logErr) {
          console.warn(`[FCM] Failed to log notification (table may not exist):`, logErr.message)
        }
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
