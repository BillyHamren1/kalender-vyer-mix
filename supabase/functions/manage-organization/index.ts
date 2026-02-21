import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Authenticate via webhook secret
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!webhookSecret || apiKey !== webhookSecret) {
      console.error('[manage-organization] Invalid or missing API key')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, organization } = await req.json()

    if (!action || !organization) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: action, organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!organization.id || !organization.name || !organization.slug) {
      return new Response(
        JSON.stringify({ error: 'organization must include id, name, and slug' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (action === 'create') {
      console.log(`[manage-organization] Creating/upserting organization: ${organization.name} (${organization.id})`)

      const { data, error } = await supabase
        .from('organizations')
        .upsert(
          {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          { onConflict: 'id' }
        )
        .select()
        .single()

      if (error) {
        console.error('[manage-organization] Error creating organization:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create organization', detail: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[manage-organization] Organization created/updated: ${data.id}`)
      return new Response(
        JSON.stringify({ success: true, organization_id: data.id, action: 'created' }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'update') {
      console.log(`[manage-organization] Updating organization: ${organization.id}`)

      const updateData: Record<string, string> = {}
      if (organization.name) updateData.name = organization.name
      if (organization.slug) updateData.slug = organization.slug

      const { data, error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', organization.id)
        .select()
        .single()

      if (error) {
        console.error('[manage-organization] Error updating organization:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to update organization', detail: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Organization not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[manage-organization] Organization updated: ${data.id}`)
      return new Response(
        JSON.stringify({ success: true, organization_id: data.id, action: 'updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Use "create" or "update".` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[manage-organization] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
