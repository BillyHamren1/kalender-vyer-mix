import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

interface InvoicePayload {
  DocumentNumber?: string;
  SupplierName: string;
  SupplierNumber?: string;
  InvoiceDate?: string;
  DueDate?: string;
  Total?: number;
  GrossTotal?: number;
  Currency?: string;
  Status?: string;
  Description?: string;
  OurReference?: string;
  YourReference?: string;
  Comments?: string;
  SupplierInvoiceNumber?: string;
  CostCenter?: string;
  Project?: string;
  InvoiceFileUrl?: string;
  FileName?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate via API key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');

    if (!apiKey || apiKey !== webhookSecret) {
      console.error('[receive-invoice] Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Resolve organization_id for multi-tenant
    const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
    const organizationId = orgData?.id;

    const payload: InvoicePayload = await req.json();
    console.log('[receive-invoice] Received payload:', JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.SupplierName) {
      return new Response(
        JSON.stringify({ error: 'SupplierName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === MATCHING STRATEGY ===
    // 1. Try to match via OurReference -> bookings.booking_number -> project
    // 2. Try to match via Project field -> projects.name
    // 3. Try to match via Project field -> packing_projects.name
    // 4. Try to match via Project field -> large_projects.name
    // 5. No match -> log and return unmatched

    let matchedProjectId: string | null = null;
    let matchedPackingId: string | null = null;
    let matchedLargeProjectId: string | null = null;
    let matchType: string = 'unmatched';
    let matchDetail: string = '';

    const ourRef = (payload.OurReference || '').trim();
    const projectField = (payload.Project || '').trim();

    // Strategy 1: OurReference -> booking_number -> project/job
    if (ourRef) {
      console.log(`[receive-invoice] Trying match via OurReference: "${ourRef}"`);

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, booking_number, assigned_project_id')
        .eq('booking_number', ourRef)
        .limit(1)
        .maybeSingle();

      if (booking) {
        console.log(`[receive-invoice] Found booking ${booking.id} via booking_number "${ourRef}"`);

        // Check if booking has a linked project
        if (booking.assigned_project_id) {
          // Check if it's a project (uuid format)
          const { data: project } = await supabase
            .from('projects')
            .select('id')
            .eq('id', booking.assigned_project_id)
            .maybeSingle();

          if (project) {
            matchedProjectId = project.id;
            matchType = 'booking_number_to_project';
            matchDetail = `Matched via OurReference "${ourRef}" → booking → project ${project.id}`;
          } else {
            // Maybe it's a job
            const { data: job } = await supabase
              .from('jobs')
              .select('id')
              .eq('id', booking.assigned_project_id)
              .maybeSingle();

            if (job) {
              matchType = 'booking_number_to_job';
              matchDetail = `Matched via OurReference "${ourRef}" → booking → job ${job.id} (no invoice table for jobs)`;
            }
          }
        }

        // Also check projects directly by booking_id
        if (!matchedProjectId) {
          const { data: projectByBooking } = await supabase
            .from('projects')
            .select('id')
            .eq('booking_id', booking.id)
            .neq('status', 'cancelled')
            .limit(1)
            .maybeSingle();

          if (projectByBooking) {
            matchedProjectId = projectByBooking.id;
            matchType = 'booking_number_to_project';
            matchDetail = `Matched via OurReference "${ourRef}" → booking → project ${projectByBooking.id}`;
          }
        }
      }
    }

    // Strategy 2: Project field -> projects.name
    if (!matchedProjectId && !matchedPackingId && !matchedLargeProjectId && projectField) {
      console.log(`[receive-invoice] Trying match via Project field: "${projectField}"`);

      const { data: project } = await supabase
        .from('projects')
        .select('id, name')
        .ilike('name', `%${projectField}%`)
        .neq('status', 'cancelled')
        .limit(1)
        .maybeSingle();

      if (project) {
        matchedProjectId = project.id;
        matchType = 'project_name';
        matchDetail = `Matched via Project field "${projectField}" → project "${project.name}" (${project.id})`;
      }
    }

    // Strategy 3: Project field -> packing_projects.name
    if (!matchedProjectId && !matchedPackingId && !matchedLargeProjectId && projectField) {
      const { data: packing } = await supabase
        .from('packing_projects')
        .select('id, name')
        .ilike('name', `%${projectField}%`)
        .limit(1)
        .maybeSingle();

      if (packing) {
        matchedPackingId = packing.id;
        matchType = 'packing_name';
        matchDetail = `Matched via Project field "${projectField}" → packing "${packing.name}" (${packing.id})`;
      }
    }

    // Strategy 4: Project field -> large_projects.name
    if (!matchedProjectId && !matchedPackingId && !matchedLargeProjectId && projectField) {
      const { data: largeProject } = await supabase
        .from('large_projects')
        .select('id, name')
        .ilike('name', `%${projectField}%`)
        .limit(1)
        .maybeSingle();

      if (largeProject) {
        matchedLargeProjectId = largeProject.id;
        matchType = 'large_project_name';
        matchDetail = `Matched via Project field "${projectField}" → large project "${largeProject.name}" (${largeProject.id})`;
      }
    }

    console.log(`[receive-invoice] Match result: ${matchType} - ${matchDetail || 'No match found'}`);

    // Build notes from extra fields
    const notesParts: string[] = [];
    if (payload.Comments) notesParts.push(payload.Comments);
    if (payload.YourReference) notesParts.push(`Deras ref: ${payload.YourReference}`);
    if (payload.CostCenter) notesParts.push(`Kostnadsställe: ${payload.CostCenter}`);
    if (payload.Currency && payload.Currency !== 'SEK') notesParts.push(`Valuta: ${payload.Currency}`);
    if (payload.GrossTotal && payload.Total && payload.GrossTotal !== payload.Total) {
      notesParts.push(`Brutto: ${payload.GrossTotal} kr`);
    }
    if (payload.Status) notesParts.push(`Fortnox-status: ${payload.Status}`);
    if (payload.SupplierNumber) notesParts.push(`Leverantörsnr: ${payload.SupplierNumber}`);
    if (payload.DocumentNumber) notesParts.push(`Dokumentnr: ${payload.DocumentNumber}`);
    if (!matchedProjectId && !matchedPackingId && !matchedLargeProjectId) {
      notesParts.push(`OurReference: ${ourRef || '(tomt)'}`);
      notesParts.push(`Project: ${projectField || '(tomt)'}`);
    }
    const notes = notesParts.join('\n');

    let insertedId: string | null = null;
    let insertTable: string = '';

    // Insert into the appropriate invoice table
    if (matchedProjectId) {
      const { data: inserted, error: insertError } = await supabase
        .from('project_invoices')
        .insert({
          project_id: matchedProjectId,
          supplier: payload.SupplierName,
          invoice_number: payload.SupplierInvoiceNumber || payload.DocumentNumber || null,
          invoiced_amount: payload.Total || 0,
          invoice_date: payload.InvoiceDate || null,
          due_date: payload.DueDate || null,
          status: 'unpaid',
          notes: notes || null,
          invoice_file_url: payload.InvoiceFileUrl || null,
          organization_id: organizationId,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[receive-invoice] Error inserting project_invoice:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to insert invoice', detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      insertedId = inserted.id;
      insertTable = 'project_invoices';
      console.log(`[receive-invoice] Inserted into project_invoices: ${inserted.id}`);

    } else if (matchedPackingId) {
      const { data: inserted, error: insertError } = await supabase
        .from('packing_invoices')
        .insert({
          packing_id: matchedPackingId,
          supplier: payload.SupplierName,
          invoice_number: payload.SupplierInvoiceNumber || payload.DocumentNumber || null,
          invoiced_amount: payload.Total || 0,
          invoice_date: payload.InvoiceDate || null,
          due_date: payload.DueDate || null,
          status: 'unpaid',
          notes: notes || null,
          invoice_file_url: payload.InvoiceFileUrl || null,
          organization_id: organizationId,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[receive-invoice] Error inserting packing_invoice:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to insert invoice', detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      insertedId = inserted.id;
      insertTable = 'packing_invoices';
      console.log(`[receive-invoice] Inserted into packing_invoices: ${inserted.id}`);

    } else {
      // No match - log full payload for manual review
      console.warn(`[receive-invoice] UNMATCHED invoice from "${payload.SupplierName}" - OurReference: "${ourRef}", Project: "${projectField}"`);
      console.warn('[receive-invoice] Full unmatched payload:', JSON.stringify(payload, null, 2));

      return new Response(
        JSON.stringify({
          status: 'unmatched',
          message: 'Fakturan kunde inte matchas till något projekt. Loggar payloaden för manuell granskning.',
          match_attempts: {
            our_reference: ourRef || null,
            project_field: projectField || null,
          },
          payload_received: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'matched',
        match_type: matchType,
        match_detail: matchDetail,
        inserted_id: insertedId,
        inserted_table: insertTable,
        supplier: payload.SupplierName,
        amount: payload.Total,
        invoice_number: payload.SupplierInvoiceNumber || payload.DocumentNumber,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[receive-invoice] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
