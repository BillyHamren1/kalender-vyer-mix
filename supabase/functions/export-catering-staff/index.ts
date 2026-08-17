// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");
    if (!expectedSecret) return json({ success: false, error: "WEBHOOK_NOT_CONFIGURED" }, 500);
    if (!providedSecret || providedSecret !== expectedSecret) return json({ success: false, error: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({}));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
    if (!organizationId) return json({ success: false, error: "organization_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: org, error: orgError } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (orgError) return json({ success: false, error: "ORG_LOOKUP_FAILED" }, 500);
    if (!org) return json({ success: false, error: "ORG_NOT_FOUND" }, 404);

    // Deliberately export only workforce-directory fields. Salary, notes, phone,
    // emergency contacts and other HR data never leave Planning through this endpoint.
    const { data, error } = await admin
      .from("staff_members")
      .select("id,user_id,name,email,role,tags,is_active,employment_type")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) return json({ success: false, error: "STAFF_DIRECTORY_READ_FAILED", details: error.message }, 500);

    const staff = (data ?? []).map((row: any) => ({
      staff_id: row.id,
      user_id: row.user_id ?? null,
      display_name: row.name,
      email: row.email ?? null,
      role: row.role ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      employment_type: row.employment_type ?? "employee",
      is_active: row.is_active !== false,
    }));

    return json({
      success: true,
      organization_id: organizationId,
      generated_at: new Date().toISOString(),
      staff,
    });
  } catch (error) {
    console.error("[export-catering-staff] Internal error:", error);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(error) }, 500);
  }
});
