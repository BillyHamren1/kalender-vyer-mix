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
  // Which value the user chose: 'booking' or 'planning'
  chosenSource?: 'booking' | 'planning';
}

interface ProductComparison {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  productName: string;
  field: string;
  localValue: any;
  externalValue: any;
  label: string;
}

// ── Helpers mirrored from import-bookings ──────────────────────────────

const normalizeDateOnly = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;
  const dateMatch = asString.match(/\d{4}-\d{2}-\d{2}/);
  return dateMatch ? dateMatch[0] : undefined;
};

const normalizeDateArray = (...candidates: unknown[]): string[] => {
  const dates: string[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const value of candidate) {
        const normalized = normalizeDateOnly(value);
        if (normalized && !dates.includes(normalized)) dates.push(normalized);
      }
      continue;
    }
    const normalized = normalizeDateOnly(candidate);
    if (normalized && !dates.includes(normalized)) dates.push(normalized);
  }
  return dates;
};

const parseTimeRange = (value: unknown): { start: string; end: string } | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;
  const rangeMatch = asString.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!rangeMatch) return undefined;
  const norm = (t: string): string => {
    const p = t.split(':');
    return `${p[0].padStart(2, '0')}:${p[1] || '00'}:${p[2] || '00'}`;
  };
  return { start: norm(rangeMatch[1]), end: norm(rangeMatch[2]) };
};

const extractTimePart = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const hhmmss = s.match(/(\d{2}:\d{2}:\d{2})/);
  if (hhmmss) return hhmmss[1];
  const hhmm = s.match(/(\d{2}:\d{2})/);
  if (hhmm) return `${hhmm[1]}:00`;
  return undefined;
};

const normalizeStatus = (status: string | null | undefined): string => {
  const s = (status || 'PENDING').toString().trim().toUpperCase();
  if (s === 'BEKRÄFTAD' || s === 'CONFIRMED') return 'CONFIRMED';
  if (s === 'AVBOKAD' || s === 'CANCELLED') return 'CANCELLED';
  if (s === 'DRAFT' || s === 'UTKAST') return 'OFFER';
  return s;
};

/**
 * Normalize an external booking from export_bookings API format
 * to match the local Planning field names (same mapping as import-bookings).
 */
function normalizeExternalBooking(ext: any): any {
  // Client name
  let client = ext.clientName;
  if (!client && ext.client?.name) client = ext.client.name;
  if (!client && typeof ext.client === 'string') client = ext.client;
  if (!client) client = '';

  // Dates
  const rigDates = normalizeDateArray(ext.rig_up_dates, ext.rigdaydate, ext.rig_up_date, ext.rig_date);
  const eventDates = normalizeDateArray(ext.event_dates, ext.eventdate, ext.event_date);
  const rigdownDates = normalizeDateArray(ext.rig_down_dates, ext.rigdowndate, ext.rig_down_date);

  const rigdaydate = rigDates[0] || null;
  const eventdate = eventDates[0] || null;
  const rigdowndate = rigdownDates[0] || null;

  // Time fields — discrete first, then combined range fallback
  const parsedRigUpRange = parseTimeRange(ext.rig_up_time);
  const parsedRigDownRange = parseTimeRange(ext.rig_down_time);
  const parsedEventRange = parseTimeRange(ext.event_time);

  const rig_start_time = extractTimePart(ext.rig_start_time ?? ext.rig_up_start_time ?? parsedRigUpRange?.start) || null;
  const rig_end_time = extractTimePart(ext.rig_end_time ?? ext.rig_up_end_time ?? parsedRigUpRange?.end) || null;
  const event_start_time = extractTimePart(ext.event_start_time ?? ext.event_start ?? parsedEventRange?.start) || null;
  const event_end_time = extractTimePart(ext.event_end_time ?? ext.event_end ?? parsedEventRange?.end) || null;
  const rigdown_start_time = extractTimePart(ext.rigdown_start_time ?? ext.rig_down_start_time ?? parsedRigDownRange?.start) || null;
  const rigdown_end_time = extractTimePart(ext.rigdown_end_time ?? ext.rig_down_end_time ?? parsedRigDownRange?.end) || null;

  // Contact
  const contact_name = ext.contact_name ?? ext.contact_person ?? ext.contact?.name ?? null;
  const contact_email = ext.contact_email ?? ext.contact?.email ?? null;
  const contact_phone = ext.contact_phone ?? ext.contact?.phone ?? null;

  // Status
  const status = normalizeStatus(ext.status);

  // Products — normalize field names
  const products = (ext.products || []).map((p: any) => {
    const unitPrice = p.price ?? p.unit_price ?? p.rental_price ?? p.cost ?? null;
    const quantity = p.quantity || 1;
    const totalPrice = p.total ?? p.total_price ?? (unitPrice != null ? unitPrice * quantity : null);

    return {
      ...p,
      name: p.name || p.product_name || p.productName || '',
      sku: p.sku || p.article_number || null,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: p.discount ?? 0,
      assembly_cost: p.assembly_cost ?? p.labor_cost ?? p.work_cost ?? p.setup_cost ?? 0,
      handling_cost: p.handling_cost ?? p.material_cost ?? 0,
      purchase_cost: p.purchase_cost ?? p.external_cost ?? p.subrent_cost ?? 0,
    };
  });

  return {
    ...ext,
    client,
    rigdaydate,
    eventdate,
    rigdowndate,
    rig_start_time,
    rig_end_time,
    event_start_time,
    event_end_time,
    rigdown_start_time,
    rigdown_end_time,
    deliveryaddress: ext.delivery_address ?? ext.deliveryaddress ?? null,
    delivery_city: ext.delivery_city ?? null,
    delivery_postal_code: ext.delivery_postal_code ?? null,
    internalnotes: ext.internal_notes ?? ext.internalnotes ?? null,
    contact_name,
    contact_email,
    contact_phone,
    carry_more_than_10m: ext.carry_more_than_10m ?? false,
    ground_nails_allowed: ext.ground_nails_allowed ?? false,
    exact_time_needed: ext.exact_time_needed ?? false,
    exact_time_info: ext.exact_time_info ?? null,
    booking_number: ext.booking_number ?? null,
    status,
    products,
  };
}

/**
 * Send a write to the external Booking API via the planning-api edge function.
 */
async function writeToBookingApi(
  efUrl: string,
  planningApiKey: string,
  bookingId: string,
  data: Record<string, any>
): Promise<void> {
  const qs = new URLSearchParams({
    type: 'update_booking',
    method: 'POST',
    booking_id: bookingId,
  });
  const res = await fetch(`${efUrl}/functions/v1/planning-api?${qs.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': planningApiKey,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Booking API error ${res.status}: ${body.substring(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const importApiKey = Deno.env.get('IMPORT_API_KEY')!;
    const efUrl = Deno.env.get('EF_SUPABASE_URL')!;
    const planningApiKey = Deno.env.get('PLANNING_API_KEY')!;
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
      const rawExternalBookings = externalData.data || [];
      // Normalize external field names to match local schema
      const externalBookings = rawExternalBookings.map(normalizeExternalBooking);
      // Debug: log first booking's raw vs normalized products
      if (rawExternalBookings.length > 0) {
        const first = rawExternalBookings[0];
        console.log('[sync-recon] RAW products sample:', JSON.stringify((first.products || []).slice(0, 2)));
        console.log('[sync-recon] NORMALIZED products sample:', JSON.stringify((externalBookings[0].products || []).slice(0, 2)));
      }

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
        if (p.is_package_component || p.parent_product_id) continue; // skip package components and child products
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
        { key: 'rig_start_time', label: 'Rigg starttid' },
        { key: 'rig_end_time', label: 'Rigg sluttid' },
        { key: 'event_start_time', label: 'Event starttid' },
        { key: 'event_end_time', label: 'Event sluttid' },
        { key: 'rigdown_start_time', label: 'Nedrigg starttid' },
        { key: 'rigdown_end_time', label: 'Nedrigg sluttid' },
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

      const productFields = [
        { key: 'quantity', label: 'Antal' },
        { key: 'unit_price', label: 'Styckpris' },
        { key: 'total_price', label: 'Totalpris' },
        { key: 'discount', label: 'Rabatt' },
        { key: 'assembly_cost', label: 'Montagekostnad' },
        { key: 'handling_cost', label: 'Hanteringskostnad' },
        { key: 'purchase_cost', label: 'Inköpskostnad' },
        { key: 'sku', label: 'SKU' },
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

        // Time fields that need special normalization (local stores full timestamps)
        const timeFields = new Set([
          'rig_start_time', 'rig_end_time',
          'event_start_time', 'event_end_time',
          'rigdown_start_time', 'rigdown_end_time',
        ]);

        // Compare metadata
        for (const { key, label } of metadataFields) {
          const extVal = ext[key] ?? null;
          let localVal = local[key] ?? null;
          
          let normExt = extVal === '' ? null : extVal;
          let normLocal = localVal === '' ? null : localVal;
          
          // If local is empty/null, treat as match (Planning hasn't stored a value yet)
          if (normLocal === null || normLocal === undefined) continue;
          
          // For time fields: if Booking has no value but Planning does,
          // it means Planning assigned the time locally — skip comparison
          if (timeFields.has(key) && (normExt === null || normExt === undefined)) continue;
          
          // For time fields: extract just HH:MM:SS from local timestamps
          if (timeFields.has(key)) {
            if (normLocal && typeof normLocal === 'string') {
              const timePart = extractTimePart(normLocal);
              if (timePart) normLocal = timePart;
            }
            if (normExt && typeof normExt === 'string') {
              const timePart = extractTimePart(normExt);
              if (timePart) normExt = timePart;
            }
          }
          
          if (JSON.stringify(normExt) !== JSON.stringify(normLocal)) {
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: key, category: 'metadata',
              localValue: normLocal, externalValue: normExt,
              label
            });
          }
        }

        // Compare products — only top-level (non-child) products
        const extProducts = (ext.products || []).filter((p: any) => !p.parent_product_id && !p.is_package_component);
        const locProducts = localProductsByBooking.get(bookingId) || [];

        const extProductNames = new Map(extProducts.map((p: any) => [p.name?.trim(), p]));
        const localProductNames = new Map(locProducts.map((p: any) => [p.name?.trim(), p]));

        for (const [name, extP] of extProductNames) {
          const localP = localProductNames.get(name);
          if (!localP) {
            continue; // Planning saknar produkten = räkna som match
          } else {
            // Compare each product field
            for (const { key, label } of productFields) {
              const extVal = extP[key] ?? null;
              const localVal = localP[key] ?? null;
              const normExt = extVal === '' ? null : (typeof extVal === 'number' ? extVal : extVal);
              const normLocal = localVal === '' ? null : (typeof localVal === 'number' ? localVal : localVal);
              
              // If local is empty/null/0, treat as match
              if (normLocal === null || normLocal === undefined || normLocal === 0) continue;
              
              if (JSON.stringify(normExt) !== JSON.stringify(normLocal)) {
                discrepancies.push({
                  bookingId, bookingNumber, client: clientName,
                  field: `_product_field:${name}:${key}`, category: 'products',
                  localValue: normLocal, externalValue: normExt,
                  label: `${name} — ${label}`
                });
              }
            }
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

        // Compare attachments by identity (URL + filename fallback)
        const normalizeAttachmentValue = (value: unknown): string | null => {
          if (!value) return null;
          const normalized = decodeURIComponent(String(value).trim())
            .split('?')[0]
            .split('#')[0]
            .toLowerCase();
          return normalized || null;
        };

        const getBaseName = (value: string) => value.split('/').pop() || value;

        const toAttachmentEntry = (attachment: any) => {
          const url = normalizeAttachmentValue(attachment.url || attachment.file_url || attachment.public_url || '');
          const fileName = normalizeAttachmentValue(attachment.file_name || attachment.name || attachment.filename || '');
          const keys = new Set<string>();

          if (url) {
            keys.add(url);
            keys.add(getBaseName(url));
          }

          if (fileName) {
            keys.add(fileName);
            keys.add(getBaseName(fileName));
          }

          if (keys.size === 0) return null;

          return {
            id: `${fileName || ''}::${url || ''}`,
            keys,
            displayName: attachment.file_name || attachment.name || (url ? getBaseName(url) : 'Bilaga'),
          };
        };

        const extAttachments = [
          ...(ext.attachments || []),
          ...(ext.files_metadata || []),
          ...(ext.tent_images || [])
        ];
        const locAttachments = localAttachmentsByBooking.get(bookingId) || [];

        const extEntries = extAttachments.map(toAttachmentEntry).filter(Boolean) as Array<{ id: string; keys: Set<string>; displayName: string }>;
        const locEntries = locAttachments.map(toAttachmentEntry).filter(Boolean) as Array<{ id: string; keys: Set<string>; displayName: string }>;

        const hasKeyOverlap = (a: Set<string>, b: Set<string>) => [...a].some(key => b.has(key));
        const matchedExternalIds = new Set<string>();
        const matchedLocalIndexes = new Set<number>();

        for (const extEntry of extEntries) {
          const localMatchIndex = locEntries.findIndex((locEntry, index) => (
            !matchedLocalIndexes.has(index) && hasKeyOverlap(extEntry.keys, locEntry.keys)
          ));

          if (localMatchIndex >= 0) {
            matchedExternalIds.add(extEntry.id);
            matchedLocalIndexes.add(localMatchIndex);
          }
        }

        // Attachments only in Booking (missing locally) — NOT a discrepancy
        // Booking is source of truth; import-bookings will sync them eventually.

        // Attachments only in Planning (extra locally) — only flag user-uploaded ones
        for (const [index, locEntry] of locEntries.entries()) {
          if (!matchedLocalIndexes.has(index)) {
            const locAttachment = locAttachments[index];
            // Skip import-created attachments — only flag user-uploaded ones
            if (locAttachment?.source === 'import') continue;
            discrepancies.push({
              bookingId, bookingNumber, client: clientName,
              field: `_attachment_extra:${locEntry.displayName}`, category: 'attachments',
              localValue: locEntry.displayName, externalValue: null,
              label: `Extra lokal bilaga: ${locEntry.displayName}`
            });
          }
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

      // Debug: log first 5 discrepancies
      console.log('[sync-recon] Sample discrepancies:', JSON.stringify(discrepancies.slice(0, 5)));
      console.log('[sync-recon] Total discrepancies:', discrepancies.length, 'by category:', {
        metadata: discrepancies.filter(d => d.category === 'metadata').length,
        products: discrepancies.filter(d => d.category === 'products').length,
        attachments: discrepancies.filter(d => d.category === 'attachments').length,
      });

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
      // ─── Apply corrections ───────────────────────────────────────────────
      // ALL writes go through Booking API. NOTHING is written locally.
      // After Booking API confirms, we trigger import-bookings to refresh
      // Planning's local cache from the canonical Booking source.
      // ─────────────────────────────────────────────────────────────────────
      const corrections: Discrepancy[] = body.corrections || [];
      
      if (!corrections.length) {
        return new Response(JSON.stringify({ success: true, applied: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let applied = 0;
      const errors: string[] = [];

      // Group corrections by booking
      const byBooking = new Map<string, Discrepancy[]>();
      for (const c of corrections) {
        const arr = byBooking.get(c.bookingId) || [];
        arr.push(c);
        byBooking.set(c.bookingId, arr);
      }

      for (const [bookingId, bookingCorrections] of byBooking) {
        // Handle missing local booking — trigger import from Booking
        if (bookingCorrections.some(c => c.field === '_missing_local')) {
          try {
            await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
            applied++;
          } catch (e) {
            errors.push(`Import ${bookingId}: ${e.message}`);
          }
          continue;
        }

        // ── Metadata corrections → write chosen value to Booking API ──
        const metadataUpdates: Record<string, any> = {};
        for (const c of bookingCorrections) {
          if (c.category === 'metadata' && !c.field.startsWith('_')) {
            // chosenSource tells us which value the user picked
            const chosenValue = c.chosenSource === 'planning' ? c.localValue : c.externalValue;
            metadataUpdates[c.field] = chosenValue;
          }
        }

        if (Object.keys(metadataUpdates).length > 0) {
          try {
            await writeToBookingApi(efUrl, planningApiKey, bookingId, metadataUpdates);
            applied += Object.keys(metadataUpdates).length;
          } catch (e) {
            errors.push(`Booking API update ${bookingId}: ${e.message}`);
          }
        }

        // ── Product/attachment corrections → re-import from Booking ──
        const hasProductOrAttachmentCorrections = bookingCorrections.some(
          c => c.category === 'products' || c.category === 'attachments'
        );
        if (hasProductOrAttachmentCorrections) {
          try {
            await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
            applied++;
          } catch (e) {
            errors.push(`Re-import ${bookingId}: ${e.message}`);
          }
        }

        // ── Always re-import after corrections to sync Planning cache ──
        if (Object.keys(metadataUpdates).length > 0) {
          try {
            // Small delay to let Booking API process the write
            await new Promise(r => setTimeout(r, 500));
            await supabase.functions.invoke('import-bookings', {
              body: { booking_id: bookingId, syncMode: 'single', organization_id: organizationId }
            });
          } catch (e) {
            console.error(`Post-correction re-import failed for ${bookingId}:`, e.message);
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
