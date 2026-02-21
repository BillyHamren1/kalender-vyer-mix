
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Resolve organization_id for multi-tenant
    const bodyJson = await req.json();
    const { image, bookingId, bookingNumber, organization_id: explicitOrgId } = bodyJson;
    let organizationId: string | undefined
    if (explicitOrgId) {
      const { data: orgCheck } = await supabase.from('organizations').select('id').eq('id', explicitOrgId).single()
      organizationId = orgCheck?.id
    }
    if (!organizationId) {
      console.warn('[save-map-snapshot] DEPRECATION WARNING: organization_id not provided, falling back to first org.')
      const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single()
      organizationId = orgData?.id
    }

    // image, bookingId, bookingNumber already extracted above

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing map snapshot upload...');

    // Convert base64 to buffer
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayBookingNumber = bookingNumber || (bookingId ? bookingId.substring(0, 8) : 'unknown');
    const fileName = `map-snapshot-${displayBookingNumber}-${timestamp}.png`;
    const filePath = bookingId ? `${bookingId}/${fileName}` : `general/${fileName}`;

    console.log(`Uploading to storage: ${filePath}`);

    // Upload to Supabase Storage - use 'map-snapshots' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('map-snapshots')
      .upload(filePath, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload image', details: uploadError }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Upload successful:', uploadData);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('map-snapshots')
      .getPublicUrl(filePath);

    console.log('Public URL generated:', urlData.publicUrl);

    // Save attachment record to database if bookingId is provided
    let attachmentData = null;
    if (bookingId) {
      const { data: dbData, error: dbError } = await supabase
        .from('booking_attachments')
        .insert({
          booking_id: bookingId,
          file_name: fileName,
          file_type: 'image/png',
          url: urlData.publicUrl,
          organization_id: organizationId
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        // Try to clean up uploaded file
        await supabase.storage.from('map-snapshots').remove([filePath]);
        
        return new Response(
          JSON.stringify({ error: 'Failed to save attachment record', details: dbError }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      attachmentData = dbData;
      console.log('Attachment saved successfully:', attachmentData);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: urlData.publicUrl,
        filePath: filePath,
        attachment: attachmentData,
        message: 'Map snapshot saved successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
