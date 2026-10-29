// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyHubProjection, sourceRevision } from "../_shared/hub-role-projection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const VALID_ROLES = new Set(["admin", "forsaljning", "projekt", "lager"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapHubRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const incoming = input.map(String);
  const mapped = new Set<string>();
  if (incoming.includes("superadmin")) mapped.add("admin");
  for (const role of incoming) if (VALID_ROLES.has(role)) mapped.add(role);
  return [...mapped];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
    if (!expectedSecret) return json({ success: false, error: "WEBHOOK_NOT_CONFIGURED" }, 500);
    if (!webhookSecret || webhookSecret !== expectedSecret) return json({ success: false, error: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({}));
    const hubUserId = typeof body.user_id === "string" ? body.user_id : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    let revision: string | null;
    try { revision = sourceRevision(body.source_revision); } catch { return json({ success: false, error: "INVALID_SOURCE_REVISION" }, 400); }
    const fullName = typeof body.full_name === "string" ? body.full_name : undefined;
    const roles = mapHubRoles(body.roles);

    if (!hubUserId || !email || !organizationId) {
      return json({ success: false, error: "user_id, email and organization_id are required" }, 400);
    }
    if (!Array.isArray(body.roles)) return json({ success: false, error: "ROLE_SET_REQUIRED" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Organization identity is controlled by HUB propagation. Never pick a fallback tenant.
    if (roles.length) {
    const { data: org, error: orgError } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (orgError) return json({ success: false, error: "ORG_LOOKUP_FAILED" }, 500);
    if (!org) return json({ success: false, error: "ORG_NOT_FOUND", organization_id: organizationId }, 404);
    }

    const result = await applyHubProjection(admin, { hubUserId, organizationId, email, fullName, roles, revision, moduleAccess: body.module_access });
    if (!result.ok) return json({ success: false, error: result.error }, 409);
    return json({ success: true, user_id: result.userId, hub_user_id: hubUserId,
      organization_id: organizationId, roles, revoked: result.revoked,
      source_revision: result.source_revision, mode: result.created ? "created" : "canonical",
      password_synced: false,
    }, result.created ? 201 : 200);
  } catch (error) {
    console.error("[receive-user-sync] Internal error:", error);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(error) }, 500);
  }
});


