// Supplier Registry proxy + lokal cache
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REMOTE_URL =
  "https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/supplier-registry";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RemoteSupplier {
  id: string;
  name: string;
  short_name?: string | null;
  color?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  primary_contact?: unknown;
  contacts?: unknown[];
}

function mapToRow(s: RemoteSupplier, organization_id: string) {
  return {
    organization_id,
    external_id: s.id,
    name: s.name,
    short_name: s.short_name ?? null,
    color: s.color ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    website: s.website ?? null,
    address_line1: s.address_line1 ?? null,
    address_line2: s.address_line2 ?? null,
    postal_code: s.postal_code ?? null,
    city: s.city ?? null,
    country: s.country ?? null,
    notes: s.notes ?? null,
    primary_contact: s.primary_contact ?? null,
    contacts: s.contacts ?? [],
    last_synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SUPPLIER_REGISTRY_API_KEY");
    if (!apiKey) return json({ error: "missing_api_key" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // user-bound client to read org
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    const organization_id = profile?.organization_id;
    if (!organization_id) return json({ error: "no_org" }, 400);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? new URL(req.url).searchParams.get("action");
    if (!action) return json({ error: "MISSING_ACTION" }, 400);

    // Forward to upstream
    const upstreamRes = await fetch(REMOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-organization-id": organization_id,
      },
      body: JSON.stringify(body),
    });
    const upstreamJson = await upstreamRes.json();

    // Mirror successful results into local cache
    if (upstreamRes.ok && upstreamJson?.success) {
      const data = upstreamJson.data;
      const rows: RemoteSupplier[] = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0 && rows[0]?.id) {
        const mapped = rows.map((r) => mapToRow(r, organization_id));
        await admin
          .from("suppliers")
          .upsert(mapped, { onConflict: "organization_id,external_id" });
      }
    }

    return new Response(JSON.stringify(upstreamJson), {
      status: upstreamRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
