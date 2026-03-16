import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Discrepancy {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  field: string;
  category: 'metadata' | 'products' | 'attachments';
  localValue: any;
  externalValue: any;
  label: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const importApiKey = Deno.env.get('IMPORT_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the calling user via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const organizationId = profile.organization_id;
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'compare';

    if (action === 'compare') {
      // Fetch external bookings
      const apiParams = new URLSearchParams();
      apiParams.append('organization_id', organizationId);
      
      const apiUrl = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${apiParams.toString()}`;
      
      const externalResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${importApiKey}`,
          'x-api-key': importApiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!externalResponse.ok) {
        throw new Error(`External API error: ${externalResponse.status}`);
      }

      const externalData = await externalResponse.json();
      const externalBookings = externalData.data || [];

      // Fetch local bookings
      const { data: localBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', organizationId);

      // Fetch local products
      const { data: localProducts } = await supabase
        .from('booking_products')
        .select('*')
        .eq('organization_id', organizationId);

      // Fetch local attachments
      const { data: localAttachments } = await supabase
        .from('booking_attachments')
        .select('*')
        .eq('organization_id', organizationId);

      // Build local maps
      const localBookingMap = new Map((localBookings || []).map(b => [b.id, b]));
      const localProductsByBooking = new Map<string, any[]>();
      for (const p of (localProducts || [])) {
        const arr = localProductsByBooking.get(p.booking_id) || [];
        arr.push(p);
        localProductsByBooking.set(p.booking_id, arr);
      }
      const localAttachmentsByBooking = new Map<string, any[]>();
      for (const a of (localAttachments || [])) {
        const arr = localAttachmentsByBooking.get(a.booking_id) || [];
        arr.push(a);
        localAttachmentsByBooking.set(a.booking_id, arr);
      }

      const discrepancies: Discrepancy[] = [];
      const metadataFields = [
        { key: 'client', label: 'Klient' },
        { key: 'deliveryaddress', label: 'Leveransadress' },
        { key: 'delivery_city', label: 'Stad' },
        { key: 'delivery_postal_code', label: 'Postnummer' },
        { key: 'rigdaydate', label: 'Riggdatum' },
        { key: 'eventdate', label: 'Eventdatum' },
        { key: 'rigdowndate', label: 'Nedriggdatum' },
        { key: 'status', label: 'Status' },
        { key: 'internalnotes', label: 'Interna anteckningar' },
        { key: 'contact_name', label: 'Kontaktperson' },
        { key: 'contact_email', label: 'Kontakt e-post' },
        { key: 'contact_phone', label: 'Kontakt telefon' },
        { key: 'carry_more_than_10m', label: 'Bär >10m' },
        { key: 'ground_nails_allowed', label: 'Markspik tillåtet' },
        { key: 'exact_time_needed', label: 'Exakt tid krävs' },
        { key: 'exact_time_info', label: 'Tidinfo' },
        { key: 'booking_number', label: 'Bokningsnummer' },
      ];

      // Filter out historical bookings before 2026-01-01
      const cutoffDate = '2026-01-01';

      for (const ext of externalBookings) {
        const bookingId = ext.id;
        
        // Skip old bookings
        const rigDate = ext.rigdaydate || ext.eventdate;
        if (rigDate && rigDate < cutoffDate) continue;

        const local = localBookingMap.get(bookingId);
        const bookingNumber = ext.booking_number || local?.booking_number || null;
        const clientName = ext.client || local?.client || 'Okänd';

        if (!local) {
          discrepancies.push({
            bookingId, bookingNumber, client: clientName,
            field: '_missing_local', category: 'metadata',
            localValue: null, externalValue: 'exists',
            label: 'Bokning saknas lokalt'
          });
          continue;
        }

        // Compare metadata
        for (const { key, label } of metadataFields) {
          const extVal = ext[key] ?? null;
          const localVal = local[key] ?? null;
          
          // Normalize for comparison
          const normExt = extVal === '' ? null : extVal;
          const normLocal = localVal === '' ? null : localVal;
          
          if (JSON.stringify(normExt) !== JSON.stringify(normLocal)) {
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: key, category: 'metadata',
              localValue: localVal, externalValue: extVal,
              label
            });
          }
        }

        // Compare products
        const extProducts = ext.products || [];
        const locProducts = localProductsByBooking.get(bookingId) || [];

        if (extProducts.length !== locProducts.length) {
          discrepancies.push({
            bookingId, bookingNumber, client: clientName,
            field: '_product_count', category: 'products',
            localValue: locProducts.length, externalValue: extProducts.length,
            label: 'Antal produkter'
          });
        }

        // Compare individual products by name
        const extProductNames = new Map(extProducts.map((p: any) => [p.name?.trim(), p]));
        const localProductNames = new Map(locProducts.map((p: any) => [p.name?.trim(), p]));

        for (const [name, extP] of extProductNames) {
          const localP = localProductNames.get(name);
          if (!localP) {
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: `_product_missing:${name}`, category: 'products',
              localValue: null, externalValue: `${name} (${extP.quantity} st)`,
              label: `Produkt saknas lokalt: ${name}`
            });
          } else if (extP.quantity !== localP.quantity) {
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: `_product_qty:${name}`, category: 'products',
              localValue: localP.quantity, externalValue: extP.quantity,
              label: `Antal ${name}`
            });
          }
        }

        for (const [name] of localProductNames) {
          if (!extProductNames.has(name)) {
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: `_product_extra:${name}`, category: 'products',
              localValue: `${name} finns lokalt`, externalValue: null,
              label: `Extra lokal produkt: ${name}`
            });
          }
        }

        // Compare attachments count
        const extAttachments = [
          ...(ext.attachments || []),
          ...(ext.files_metadata || []),
          ...(ext.tent_images || [])
        ];
        const locAttachments = localAttachmentsByBooking.get(bookingId) || [];
        
        // Only flag if external has MORE than local (since local can have uploads)
        if (extAttachments.length > locAttachments.length) {
          discrepancies.push({
            bookingId, bookingNumber, client: clientName,
            field: '_attachment_count', category: 'attachments',
            localValue: locAttachments.length, externalValue: extAttachments.length,
            label: 'Bilagor (externa > lokala)'
          });
        }
      }

      // Check for local bookings that don't exist externally
      const externalIds = new Set(externalBookings.map((b: any) => b.id));
      for (const [id, local] of localBookingMap) {
        if (!externalIds.has(id)) {
          const rigDate = local.rigdaydate || local.eventdate;
          if (rigDate && rigDate < cutoffDate) continue;
          
          discrepancies.push({
            bookingId: id,
            bookingNumber: local.booking_number,
            client: local.client,
            field: '_missing_external', category: 'metadata',
            localValue: 'exists', externalValue: null,
            label: 'Bokning saknas i bokningssystemet'
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        discrepancies,
        summary: {
          totalExternal: externalBookings.length,
          totalLocal: localBookings?.length || 0,
          totalDiscrepancies: discrepancies.length,
          byCategory: {
            metadata: discrepancies.filter(d => d.category === 'metadata').length,
            products: discrepancies.filter(d => d.category === 'products').length,
            attachments: discrepancies.filter(d => d.category === 'attachments').length,
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'apply') {
      // Apply selected corrections
      const corrections: Discrepancy[] = body.corrections || [];
      
      if (!corrections.length) {
        return new Response(JSON.stringify({ success: true, applied: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let applied = 0;
      let errors: string[] = [];

      // Group corrections by booking
      const byBooking = new Map<string, Discrepancy[]>();
      for (const c of corrections) {
        const arr = byBooking.get(c.bookingId) || [];
        arr.push(c);
        byBooking.set(c.bookingId, arr);
      }

      for (const [bookingId, bookingCorrections] of byBooking) {
        // Handle missing local booking — trigger full import
        if (bookingCorrections.some(c => c.field === '_missing_local')) {
          try {
            const { error } = await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
            if (error) throw error;
            applied++;
          } catch (e) {
            errors.push(`Import ${bookingId}: ${e.message}`);
          }
          continue;
        }

        // Handle metadata corrections
        const metadataUpdates: Record<string, any> = {};
        for (const c of bookingCorrections) {
          if (c.category === 'metadata' && !c.field.startsWith('_')) {
            metadataUpdates[c.field] = c.externalValue;
          }
        }

        if (Object.keys(metadataUpdates).length > 0) {
          const { error } = await supabase
            .from('bookings')
            .update(metadataUpdates)
            .eq('id', bookingId)
            .eq('organization_id', organizationId);
          
          if (error) {
            errors.push(`Update ${bookingId}: ${error.message}`);
          } else {
            applied += Object.keys(metadataUpdates).length;
          }
        }

        // Handle product corrections — re-import the booking
        const hasProductCorrections = bookingCorrections.some(c => c.category === 'products');
        if (hasProductCorrections) {
          try {
            const { error } = await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
            if (error) throw error;
            applied++;
          } catch (e) {
            errors.push(`Product re-import ${bookingId}: ${e.message}`);
          }
        }

        // Handle attachment corrections — re-import the booking
        const hasAttachmentCorrections = bookingCorrections.some(c => c.category === 'attachments');
        if (hasAttachmentCorrections) {
          try {
            const { error } = await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
            if (error) throw error;
            applied++;
          } catch (e) {
            errors.push(`Attachment re-import ${bookingId}: ${e.message}`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, applied, errors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Sync reconciliation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
