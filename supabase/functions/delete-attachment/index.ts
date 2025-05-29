
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

    const { attachmentId } = await req.json();

    if (!attachmentId) {
      return new Response(
        JSON.stringify({ error: 'No attachment ID provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Deleting attachment:', attachmentId);

    // First, get the attachment record to find the file path
    const { data: attachment, error: fetchError } = await supabase
      .from('booking_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();

    if (fetchError || !attachment) {
      console.error('Attachment not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Attachment not found', details: fetchError }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Found attachment:', attachment);

    // Extract file path from URL
    let filePath = '';
    if (attachment.url) {
      const url = new URL(attachment.url);
      const pathParts = url.pathname.split('/');
      // Remove the first parts (/storage/v1/object/public/map-snapshots/)
      const bucketIndex = pathParts.indexOf('map-snapshots');
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        filePath = pathParts.slice(bucketIndex + 1).join('/');
      }
    }

    console.log('Extracted file path:', filePath);

    // Delete from storage if we have a file path
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('map-snapshots')
        .remove([filePath]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with database deletion even if storage fails
      } else {
        console.log('File deleted from storage successfully');
      }
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('booking_attachments')
      .delete()
      .eq('id', attachmentId);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete attachment record', details: dbError }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Attachment deleted successfully from database');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Attachment deleted successfully',
        deletedId: attachmentId
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
