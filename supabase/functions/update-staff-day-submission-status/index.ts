import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  deleteProjectStaffTimeCostLinesForSubmission,
  rebuildProjectStaffTimeCostLinesForSubmission,
} from "../_shared/staff-day-cost-lines.ts";

type AllowedStatus = "approved" | "needs_control" | "correction_requested";
const ALLOWED: AllowedStatus[] = ["approved", "needs_control", "correction_requested"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_auth" }, 401);

  // Authenticated client to identify caller
  const authedClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authedClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  // Service-role client for privileged reads/writes (bypasses RLS, we enforce org+role manually)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Parse + validate body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const submission_id = typeof body?.submission_id === "string" ? body.submission_id : null;
  const status = body?.status as AllowedStatus | undefined;
  const review_comment =
    typeof body?.review_comment === "string" ? body.review_comment.slice(0, 2000) : null;

  if (!submission_id) return json({ error: "submission_id_required" }, 400);
  if (!status || !ALLOWED.includes(status)) {
    return json({ error: "invalid_status", allowed: ALLOWED }, 400);
  }
  if (status === "correction_requested" && (!review_comment || !review_comment.trim())) {
    return json(
      { error: "comment_required", message: "Kommentar krävs när rapporten skickas tillbaka till användaren." },
      400,
    );
  }

  // Caller org
  const { data: prof } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  const orgId = prof?.organization_id as string | undefined;
  if (!orgId) return json({ error: "no_org" }, 403);

  // Role check: admin or projekt
  const { data: rolesData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
  const isPrivileged = roles.includes("admin") || roles.includes("projekt");
  if (!isPrivileged) return json({ error: "forbidden_role" }, 403);

  // Load existing submission
  const { data: existing, error: loadErr } = await admin
    .from("staff_day_submissions")
    .select("id, organization_id, status")
    .eq("id", submission_id)
    .maybeSingle();
  if (loadErr) return json({ error: "load_failed", detail: loadErr.message }, 500);
  if (!existing) return json({ error: "not_found" }, 404);
  if (existing.organization_id !== orgId) return json({ error: "forbidden_org" }, 403);

  // Lock: payroll_approved cannot be reverted from this endpoint
  if (existing.status === "payroll_approved") {
    return json(
      { error: "locked_payroll_approved", message: "Dagrapporten är låst (godkänd för utbetalning)." },
      409,
    );
  }

  const { error: updErr } = await admin
    .from("staff_day_submissions")
    .update({
      status,
      review_comment,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("id", submission_id)
    .eq("organization_id", orgId);
  if (updErr) return json({ error: "update_failed", detail: updErr.message }, 500);

  // Sync project_staff_time_cost_lines:
  //  - approved  -> rebuild from submission snapshot
  //  - needs_control / correction_requested -> delete old rows (not approved anymore)
  // Vi rör ALDRIG time_reports / workdays / location_time_entries /
  // travel_time_logs / day_attestations här.
  let costLinesResult: unknown = null;
  try {
    if (status === "approved") {
      costLinesResult = await rebuildProjectStaffTimeCostLinesForSubmission(admin, submission_id);
    } else if (status === "needs_control" || status === "correction_requested") {
      costLinesResult = await deleteProjectStaffTimeCostLinesForSubmission(admin, submission_id);
    }
  } catch (e) {
    console.error("[update-staff-day-submission-status] cost-lines sync failed:", e);
    costLinesResult = { error: String((e as Error)?.message ?? e) };
  }

  return json({ ok: true, id: submission_id, status, cost_lines: costLinesResult });
});
