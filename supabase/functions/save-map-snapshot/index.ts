
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

    const { bookingId, imageData, bookingNumber } = await req.json();

    if (!bookingId || !imageData) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bookingId and imageData' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing map snapshot for booking ${bookingId}`);

    // Convert base64 to blob
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayBookingNumber = bookingNumber || bookingId.substring(0, 8);
    const fileName = `booking-${displayBookingNumber}-map-${timestamp}.png`;
    const filePath = `${bookingId}/${fileName}`;

    console.log(`Uploading to storage: ${filePath}`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('map-snapshots')
      .upload(filePath, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600'
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

    // Save attachment record to database
    const { data: attachmentData, error: dbError } = await supabase
      .from('booking_attachments')
      .insert({
        booking_id: bookingId,
        file_name: fileName,
        file_type: 'image/png',
        url: urlData.publicUrl
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

    console.log('Attachment saved successfully:', attachmentData);

    return new Response(
      JSON.stringify({ 
        success: true, 
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
