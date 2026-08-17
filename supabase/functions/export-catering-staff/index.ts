// @ts-nocheck
// EventFlow Planning/Staff -> Catering Hospitality Workforce
// Minimal, tenant-scoped staff directory. Read-only. Fail closed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-catering-secret",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    // Dedicated server-side secret for this directory. Legacy WEBHOOK_SECRET is
    // still accepted only as a fallback while Catering rolls out the new header.
    const directorySecret = Deno.env.get("CATERING_STAFF_DIRECTORY_SECRET");
    const legacySecret = Deno.env.get("WEBHOOK_SECRET");
    if (!directorySecret && !legacySecret) {
      return json({ success: false, error: "DIRECTORY_NOT_CONFIGURED" }, 500);
    }

    const provided =
      req.headers.get("x-catering-secret") ?? req.headers.get("x-webhook-secret") ?? "";
    const matches =
      (!!directorySecret && provided === directorySecret) ||
      (!!legacySecret && provided === legacySecret);
    if (!provided || !matches) return json({ success: false, error: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({}));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
    if (!organizationId) return json({ success: false, error: "organization_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Server-side tenant verification: the organization must exist, and the
    // staff query below is hard-scoped to it. No client value widens the scope.
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) return json({ success: false, error: "ORG_LOOKUP_FAILED" }, 500);
    if (!org) return json({ success: false, error: "ORG_NOT_FOUND" }, 404);

    // Deliberately export only workforce-directory fields. Salary, hourly_rate,
    // notes, phone, address, emergency contacts, time reports and GPS data never
    // leave Planning through this endpoint.
    const { data, error } = await admin
      .from("staff_members")
      .select("id,user_id,name,email,role,tags,is_active,employment_type")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) {
      return json(
        { success: false, error: "STAFF_DIRECTORY_READ_FAILED", details: error.message },
        500,
      );
    }

    const staff = (data ?? []).map((row: any) => ({
      // Stable external references — same person always yields the same values.
      host_staff_ref: row.id,
      host_user_ref: row.user_id ?? null,
      host_org_ref: organizationId,
      name: row.name,
      email: row.email ?? null,
      role: row.role ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      employment_type: row.employment_type ?? "employee",
      is_active: row.is_active !== false,
    }));

    return json({
      success: true,
      contract_version: 1,
      organization_id: organizationId,
      generated_at: new Date().toISOString(),
      staff,
    });
  } catch (error) {
    console.error("[export-catering-staff] Internal error:", error);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(error) }, 500);
  }
});
