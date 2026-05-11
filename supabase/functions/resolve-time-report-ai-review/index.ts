// resolve-time-report-ai-review
// Uppdaterar endast time_report_ai_reviews.review_status + admin_feedback.
// Rör inget annat (time_reports, workdays, gps, timers).
//
// Input (POST):
//   { reviewId, decision: 'accepted' | 'rejected' | 'needs_human_review', adminFeedback? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_DECISIONS = new Set(["accepted", "rejected", "needs_human_review"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await req.json().catch(() => null) as
      | { reviewId?: string; decision?: string; adminFeedback?: string }
      | null;
    if (!body?.reviewId || !body?.decision) {
      return json({ error: "reviewId and decision required" }, 400);
    }
    if (!ALLOWED_DECISIONS.has(body.decision)) {
      return json({ error: "invalid_decision", allowed: [...ALLOWED_DECISIONS] }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: prof } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prof?.organization_id) return json({ error: "no_org" }, 403);

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden_role" }, 403);

    const { data: review } = await supabase
      .from("time_report_ai_reviews")
      .select("id, organization_id, review_status")
      .eq("id", body.reviewId)
      .maybeSingle();
    if (!review) return json({ error: "review_not_found" }, 404);
    if (review.organization_id !== prof.organization_id) {
      return json({ error: "forbidden_org" }, 403);
    }

    const { data: updated, error: upErr } = await supabase
      .from("time_report_ai_reviews")
      .update({
        review_status: body.decision,
        admin_feedback: body.adminFeedback ?? null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.reviewId)
      .select("*")
      .single();

    if (upErr) {
      console.error("[resolve-time-report-ai-review] update error", upErr);
      return json({ error: "update_failed", detail: upErr.message }, 500);
    }

    return json({ row: updated });
  } catch (err) {
    console.error("[resolve-time-report-ai-review] error", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
