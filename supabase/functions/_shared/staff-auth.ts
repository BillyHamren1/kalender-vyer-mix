// Shared dual-auth for staff snapshot edge functions.
// Accepts:
//   1. Mobile token (base64 JSON `{ staffId, expiresAt }`) — same as workday/mobile-app-api
//   2. Supabase JWT — admin/web flow with self/privileged check
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface MobileAuthResult {
  mode: "mobile";
  staffId: string;
  organizationId: string;
  admin: SupabaseClient;
}
export interface JwtAuthResult {
  mode: "jwt";
  userId: string;
  organizationId: string;
  isPrivileged: boolean;
  admin: SupabaseClient;
}
export type AuthResult = MobileAuthResult | JwtAuthResult;
export interface AuthError { status: number; error: string }

async function resolveJwtUserId(
  userClient: SupabaseClient,
  token: string,
): Promise<{ userId: string | null; error: string | null }> {
  const authApi = userClient.auth as SupabaseClient["auth"] & {
    getClaims?: (jwt?: string) => Promise<{ data: { claims?: { sub?: string } } | null; error: { message?: string } | null }>;
  };

  if (typeof authApi.getClaims === "function") {
    const { data: claimsData, error: claimsErr } = await authApi.getClaims(token);
    if (claimsErr) return { userId: null, error: claimsErr.message ?? "Unauthorized" };
    return { userId: claimsData?.claims?.sub ?? null, error: null };
  }

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr) return { userId: null, error: userErr.message ?? "Unauthorized" };
  return { userId: userData.user?.id ?? null, error: null };
}

function tryParseMobileToken(token: string): { staffId?: string; expiresAt?: number } | null {
  try {
    if (token.includes(".")) return null; // JWTs contain dots
    const payload = JSON.parse(atob(token));
    if (typeof payload?.staffId === "string" && typeof payload?.expiresAt === "number") return payload;
    return null;
  } catch { return null; }
}

const PRIVILEGED_ROLES = new Set(["admin", "projekt", "lager"]);

export async function authenticateStaffRequest(
  req: Request,
  opts: { requestedStaffId?: string | null } = {},
): Promise<{ ok: true; auth: AuthResult } | { ok: false; err: AuthError }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, err: { status: 401, error: "Unauthorized" } };
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, err: { status: 401, error: "Missing token" } };

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Mobile token
  const mobile = tryParseMobileToken(token);
  if (mobile) {
    if (!mobile.expiresAt || Date.now() > mobile.expiresAt) return { ok: false, err: { status: 401, error: "Mobile token expired" } };
    if (!mobile.staffId) return { ok: false, err: { status: 401, error: "Invalid mobile token" } };
    const { data: staffRow, error: staffErr } = await admin
      .from("staff_members").select("id, organization_id, user_id").eq("id", mobile.staffId).maybeSingle();
    if (staffErr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = staffErr as any;
      const msg = e?.message || e?.hint || e?.details || e?.code || JSON.stringify(e) || "unknown";
      console.error("[staff-auth] staff lookup failed", { staffId: mobile.staffId, code: e?.code, message: e?.message, details: e?.details, hint: e?.hint });
      return { ok: false, err: { status: 500, error: `Staff lookup failed: ${msg}` } };
    }
    if (!staffRow?.organization_id) return { ok: false, err: { status: 404, error: "Staff not found" } };

    // Optional admin "view-as" — read-only impersonering via x-view-as-staff-header.
    const viewAsHeader = req.headers.get("x-view-as-staff");
    if (viewAsHeader && viewAsHeader !== mobile.staffId) {
      // Verifiera att underliggande staff har admin-roll i sin org.
      let isAdmin = false;
      if (staffRow.user_id) {
        const { data: roles } = await admin
          .from("user_roles").select("role").eq("user_id", staffRow.user_id);
        isAdmin = (roles ?? []).some((r) => (r.role as string) === "admin");
      }
      if (!isAdmin) {
        return { ok: false, err: { status: 403, error: "view-as requires admin role" } };
      }
      // Verifiera att target ligger i samma org.
      const { data: targetStaff } = await admin
        .from("staff_members").select("id, organization_id").eq("id", viewAsHeader).maybeSingle();
      if (!targetStaff || targetStaff.organization_id !== staffRow.organization_id) {
        return { ok: false, err: { status: 404, error: "view-as target not in your organization" } };
      }
      if (opts.requestedStaffId && opts.requestedStaffId !== viewAsHeader) {
        return { ok: false, err: { status: 403, error: "requestedStaffId must match x-view-as-staff" } };
      }
      return { ok: true, auth: { mode: "mobile", staffId: viewAsHeader, organizationId: staffRow.organization_id as string, admin } };
    }

    if (opts.requestedStaffId && opts.requestedStaffId !== mobile.staffId) {
      // Tillåt privilegierade roller (admin/projekt/lager) att läsa andra staff i samma org
      // — samma policy som JWT-vägen. Annars bryts admin-vyer när mobile-token
      // ligger kvar i localStorage på webben.
      let isPrivileged = false;
      if (staffRow.user_id) {
        const { data: roles } = await admin
          .from("user_roles").select("role").eq("user_id", staffRow.user_id);
        isPrivileged = (roles ?? []).some((r) => PRIVILEGED_ROLES.has(r.role as string));
      }
      if (!isPrivileged) {
        return { ok: false, err: { status: 403, error: "Staff may only read self" } };
      }
      const { data: targetStaff } = await admin
        .from("staff_members").select("id, organization_id").eq("id", opts.requestedStaffId).maybeSingle();
      if (!targetStaff || targetStaff.organization_id !== staffRow.organization_id) {
        return { ok: false, err: { status: 404, error: "Staff not found in your organization" } };
      }
      return { ok: true, auth: { mode: "mobile", staffId: opts.requestedStaffId, organizationId: staffRow.organization_id as string, admin } };
    }
    return { ok: true, auth: { mode: "mobile", staffId: mobile.staffId, organizationId: staffRow.organization_id as string, admin } };
  }

  // Supabase JWT
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { userId } = await resolveJwtUserId(userClient, token);
  if (!userId) return { ok: false, err: { status: 401, error: "Unauthorized" } };

  const { data: profile } = await admin
    .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  const orgId = profile?.organization_id as string | undefined;
  if (!orgId) return { ok: false, err: { status: 403, error: "No organization for caller" } };

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const isPrivileged = (roles ?? []).some((r) => PRIVILEGED_ROLES.has(r.role as string));

  return { ok: true, auth: { mode: "jwt", userId, organizationId: orgId, isPrivileged, admin } };
}

export async function authorizeStaffAccess(
  auth: AuthResult,
  requestedStaffId: string,
): Promise<{ ok: true; orgId: string } | { ok: false; err: AuthError }> {
  if (auth.mode === "mobile") {
    if (requestedStaffId !== auth.staffId) return { ok: false, err: { status: 403, error: "Staff may only read self" } };
    return { ok: true, orgId: auth.organizationId };
  }
  const { data: targetStaff } = await auth.admin
    .from("staff_members").select("id, user_id, organization_id").eq("id", requestedStaffId).maybeSingle();
  if (!targetStaff || targetStaff.organization_id !== auth.organizationId) {
    return { ok: false, err: { status: 404, error: "Staff not found in your organization" } };
  }
  const isSelf = targetStaff.user_id === auth.userId;
  if (!isSelf && !auth.isPrivileged) return { ok: false, err: { status: 403, error: "Forbidden" } };
  return { ok: true, orgId: auth.organizationId };
}
