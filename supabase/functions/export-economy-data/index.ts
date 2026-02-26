import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Export Economy Data API
 * 
 * Comprehensive endpoint for external accounting module.
 * Authenticates via x-api-key (EXPORT_API_KEY) header.
 * Requires organization_id in query params.
 * 
 * GET ?organization_id=<uuid>&scope=<scope>&booking_id=<optional>
 * 
 * Scopes:
 *   - "all"              → Everything below combined
 *   - "bookings"         → All bookings with economy data
 *   - "time_reports"     → Time reports from external API (per booking)
 *   - "purchases"        → Project/packing/large-project purchases with receipt URLs
 *   - "invoices"         → Project/packing invoices with file URLs
 *   - "supplier_invoices"→ Fortnox supplier invoices (per booking)
 *   - "quotes"           → Project/packing quotes with file URLs
 *   - "budgets"          → Project/packing/large-project budgets
 *   - "labor_costs"      → Project/packing labor costs
 *   - "product_costs"    → Product costs per booking (external API)
 *   - "staff"            → Staff members list
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth via API key
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = Deno.env.get('EXPORT_API_KEY');
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organization_id');
    const scope = url.searchParams.get('scope') || 'all';
    const bookingId = url.searchParams.get('booking_id'); // optional filter

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'Missing organization_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const efUrl = Deno.env.get('EF_SUPABASE_URL');
    const planningApiKey = Deno.env.get('PLANNING_API_KEY');

    const result: Record<string, any> = {};
    const scopes = scope === 'all'
      ? ['bookings', 'time_reports', 'purchases', 'invoices', 'supplier_invoices', 'quotes', 'budgets', 'labor_costs', 'product_costs', 'staff']
      : [scope];

    // --- Fetch bookings for this org (needed for external API calls) ---
    let bookings: any[] = [];
    const needsBookings = scopes.some(s => ['all', 'bookings', 'time_reports', 'supplier_invoices', 'product_costs'].includes(s));

    if (needsBookings || bookingId) {
      let q = supabase
        .from('bookings')
        .select('id, client, booking_number, status, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, economics_data, large_project_id, created_at, updated_at')
        .eq('organization_id', organizationId);
      if (bookingId) q = q.eq('id', bookingId);
      const { data, error } = await q;
      if (error) throw error;
      bookings = data || [];
    }

    // Helper: fetch from external planning API
    async function fetchExternal(type: string, bid: string): Promise<any> {
      if (!efUrl || !planningApiKey) return null;
      try {
        const qs = new URLSearchParams({ type, booking_id: bid });
        const res = await fetch(`${efUrl}/functions/v1/planning-api-proxy?${qs.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-api-key': planningApiKey },
        });
        return await res.json();
      } catch { return null; }
    }

    // === BOOKINGS ===
    if (scopes.includes('bookings')) {
      result.bookings = bookings;
    }

    // === TIME REPORTS (external per booking) ===
    if (scopes.includes('time_reports')) {
      const allReports: any[] = [];
      await Promise.all(
        bookings.map(async (b) => {
          const data = await fetchExternal('time_reports', b.id);
          if (Array.isArray(data)) {
            allReports.push(...data.map((r: any) => ({ ...r, booking_id: b.id, booking_number: b.booking_number, client: b.client })));
          }
        })
      );
      result.time_reports = allReports;
    }

    // === PURCHASES (local: project, packing, large_project) ===
    if (scopes.includes('purchases')) {
      const [projPurchases, packPurchases, lpPurchases] = await Promise.all([
        supabase.from('project_purchases').select('*, projects:project_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('packing_purchases').select('*, packing_projects:packing_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('large_project_purchases').select('*, large_projects:large_project_id(id, name)').eq('organization_id', organizationId),
      ]);
      result.purchases = {
        project_purchases: projPurchases.data || [],
        packing_purchases: packPurchases.data || [],
        large_project_purchases: lpPurchases.data || [],
      };
    }

    // === INVOICES (local: project, packing — with file URLs) ===
    if (scopes.includes('invoices')) {
      const [projInvoices, packInvoices] = await Promise.all([
        supabase.from('project_invoices').select('*, projects:project_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('packing_invoices').select('*, packing_projects:packing_id(id, name, booking_id)').eq('organization_id', organizationId),
      ]);
      result.invoices = {
        project_invoices: projInvoices.data || [],
        packing_invoices: packInvoices.data || [],
      };
    }

    // === SUPPLIER INVOICES (external, per booking — Fortnox) ===
    if (scopes.includes('supplier_invoices')) {
      const allSupplier: any[] = [];
      await Promise.all(
        bookings.map(async (b) => {
          const data = await fetchExternal('supplier_invoices', b.id);
          if (Array.isArray(data)) {
            allSupplier.push(...data.map((r: any) => ({ ...r, booking_id: b.id, booking_number: b.booking_number, client: b.client })));
          }
        })
      );
      result.supplier_invoices = allSupplier;
    }

    // === QUOTES (local: project, packing — with file URLs) ===
    if (scopes.includes('quotes')) {
      const [projQuotes, packQuotes] = await Promise.all([
        supabase.from('project_quotes').select('*, projects:project_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('packing_quotes').select('*, packing_projects:packing_id(id, name, booking_id)').eq('organization_id', organizationId),
      ]);
      result.quotes = {
        project_quotes: projQuotes.data || [],
        packing_quotes: packQuotes.data || [],
      };
    }

    // === BUDGETS (local: project, packing, large_project) ===
    if (scopes.includes('budgets')) {
      const [projBudget, packBudget, lpBudget] = await Promise.all([
        supabase.from('project_budget').select('*, projects:project_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('packing_budget').select('*, packing_projects:packing_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('large_project_budget').select('*, large_projects:large_project_id(id, name)').eq('organization_id', organizationId),
      ]);
      result.budgets = {
        project_budgets: projBudget.data || [],
        packing_budgets: packBudget.data || [],
        large_project_budgets: lpBudget.data || [],
      };
    }

    // === LABOR COSTS (local: project, packing) ===
    if (scopes.includes('labor_costs')) {
      const [projLabor, packLabor] = await Promise.all([
        supabase.from('project_labor_costs').select('*, projects:project_id(id, name, booking_id)').eq('organization_id', organizationId),
        supabase.from('packing_labor_costs').select('*, packing_projects:packing_id(id, name, booking_id)').eq('organization_id', organizationId),
      ]);
      result.labor_costs = {
        project_labor_costs: projLabor.data || [],
        packing_labor_costs: packLabor.data || [],
      };
    }

    // === PRODUCT COSTS (external per booking) ===
    if (scopes.includes('product_costs')) {
      const allProducts: any[] = [];
      await Promise.all(
        bookings.map(async (b) => {
          const data = await fetchExternal('product_costs', b.id);
          if (data && data.products) {
            allProducts.push({ booking_id: b.id, booking_number: b.booking_number, client: b.client, ...data });
          }
        })
      );
      result.product_costs = allProducts;
    }

    // === STAFF ===
    if (scopes.includes('staff')) {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name, email, phone, hourly_rate, overtime_rate, role')
        .eq('organization_id', organizationId);
      result.staff = data || [];
    }

    return new Response(JSON.stringify({
      organization_id: organizationId,
      exported_at: new Date().toISOString(),
      scope,
      data: result,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Export economy data error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
