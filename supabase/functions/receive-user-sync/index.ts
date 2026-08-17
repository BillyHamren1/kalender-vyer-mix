// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return null;
    const match = data?.users?.find((u: any) => (u.email || "").trim().toLowerCase() === email);
    if (match) return match;
    if ((data?.users?.length || 0) < 100) return null;
  }
  return null;
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
    const password = typeof body.password === "string" && body.password ? body.password : undefined;
    const fullName = typeof body.full_name === "string" ? body.full_name : undefined;
    const roles = mapHubRoles(body.roles);

    if (!hubUserId || !email || !organizationId) {
      return json({ success: false, error: "user_id, email and organization_id are required" }, 400);
    }
    if (!roles.length) return json({ success: false, error: "NO_VALID_ROLE_FOR_CALENDAR" }, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Organization identity is controlled by HUB propagation. Never pick a fallback tenant.
    const { data: org, error: orgError } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (orgError) return json({ success: false, error: "ORG_LOOKUP_FAILED" }, 500);
    if (!org) return json({ success: false, error: "ORG_NOT_FOUND", organization_id: organizationId }, 404);

    // Hub UUID is canonical for new users. Email is only a legacy-adoption fallback.
    let localUserId = hubUserId;
    let localEmail = email;
    let created = false;
    const { data: exact } = await admin.auth.admin.getUserById(hubUserId);
    if (exact?.user) {
      localEmail = exact.user.email || email;
      const update: Record<string, unknown> = {
        user_metadata: {
          ...exact.user.user_metadata,
          full_name: fullName ?? exact.user.user_metadata?.full_name,
          organization_id: organizationId,
          hub_user_id: hubUserId,
          synced_from: "eventflow_hub",
        },
      };
      if (password) update.password = password;
      const { error } = await admin.auth.admin.updateUserById(localUserId, update);
      if (error) return json({ success: false, error: "USER_UPDATE_FAILED", details: error.message }, 500);
    } else {
      const legacy = await findUserByEmail(admin, email);
      if (legacy) {
        localUserId = legacy.id;
        localEmail = legacy.email || email;
        const update: Record<string, unknown> = {
          user_metadata: {
            ...legacy.user_metadata,
            full_name: fullName ?? legacy.user_metadata?.full_name,
            organization_id: organizationId,
            hub_user_id: hubUserId,
            synced_from: "eventflow_hub",
          },
        };
        if (password) update.password = password;
        const { error } = await admin.auth.admin.updateUserById(localUserId, update);
        if (error) return json({ success: false, error: "LEGACY_USER_ADOPTION_FAILED", details: error.message }, 500);
      } else {
        const createParams: Record<string, unknown> = {
          id: hubUserId,
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName || "", organization_id: organizationId, hub_user_id: hubUserId, synced_from: "eventflow_hub" },
        };
        if (password) createParams.password = password;
        const { data, error } = await admin.auth.admin.createUser(createParams);
        if (error || !data?.user) return json({ success: false, error: "USER_CREATE_FAILED", details: error?.message }, 500);
        localUserId = data.user.id;
        localEmail = data.user.email || email;
        created = true;
      }
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: localUserId,
      email: localEmail,
      full_name: fullName || null,
      organization_id: organizationId,
    }, { onConflict: "user_id" });
    if (profileError) return json({ success: false, error: "PROFILE_SYNC_FAILED", details: profileError.message }, 500);

    // Tenant-safe role sync: never touch roles in another organization.
    const { error: deleteError } = await admin.from("user_roles")
      .delete().eq("user_id", localUserId).eq("organization_id", organizationId);
    if (deleteError) return json({ success: false, error: "ROLE_DELETE_FAILED", details: deleteError.message }, 500);

    const { error: roleError } = await admin.from("user_roles").insert(
      roles.map((role) => ({ user_id: localUserId, role, organization_id: organizationId })),
    );
    if (roleError) return json({ success: false, error: "ROLE_INSERT_FAILED", details: roleError.message }, 500);

    return json({
      success: true,
      user_id: localUserId,
      hub_user_id: hubUserId,
      organization_id: organizationId,
      roles,
      mode: created ? "created" : localUserId === hubUserId ? "canonical" : "legacy_adopted",
      password_synced: !!password,
    }, created ? 201 : 200);
  } catch (error) {
    console.error("[receive-user-sync] Internal error:", error);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(error) }, 500);
  }
});
