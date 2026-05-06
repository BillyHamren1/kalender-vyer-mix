import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPORT_URL = "https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const importKey = Deno.env.get("IMPORT_API_KEY");
  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!importKey) {
    return new Response(JSON.stringify({ error: "IMPORT_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(sbUrl, sbKey);

  // Fetch all distinct organizations that have bookings
  const { data: orgRows } = await supabase
    .from("bookings")
    .select("organization_id")
    .not("organization_id", "is", null);
  const orgs = [...new Set((orgRows ?? []).map((r: any) => r.organization_id))];

  const summary: any[] = [];
  let totalUpdated = 0;
  let totalWithContact = 0;

  for (const org of orgs) {
    const url = `${EXPORT_URL}?organization_id=${encodeURIComponent(org)}&limit=5000`;
    const resp = await fetch(url, {
      headers: { "x-api-key": importKey, "Authorization": `Bearer ${importKey}` },
    });
    if (!resp.ok) {
      summary.push({ org, error: `export ${resp.status}` });
      continue;
    }
    const payload = await resp.json();
    const arr = payload.bookings ?? payload.data ?? [];
    let withContact = 0;
    let updated = 0;
    let failed = 0;

    for (const b of arr) {
      const name = (b.delivery_contact_name ?? "").toString().trim() || null;
      const phone = (b.delivery_contact_phone ?? "").toString().trim() || null;
      const email = (b.delivery_contact_email ?? "").toString().trim() || null;
      if (!name && !phone && !email) continue;
      withContact++;

      const { error } = await supabase
        .from("bookings")
        .update({ contact_name: name, contact_phone: phone, contact_email: email })
        .eq("id", b.id)
        .eq("organization_id", org);
      if (error) failed++; else updated++;
    }

    totalUpdated += updated;
    totalWithContact += withContact;
    summary.push({ org, total: arr.length, withContact, updated, failed });
  }

  return new Response(JSON.stringify({
    totals: { updated: totalUpdated, withContact: totalWithContact },
    perOrg: summary,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
