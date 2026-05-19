/**
 * rebuild-staff-day
 * ────────────────────────────────────────────────────────────────────────────
 * Internal endpoint that rebuilds the canonical snapshot for a single
 * (staff_id, date) and writes an audit row describing what triggered it.
 *
 * Triggers (reason):
 *   late_ping              – ny GPS-ping kom in efter att dagen redan rullat
 *   geofence_changed       – geofence/zone-konfig ändrats
 *   admin_edit             – admin justerade time_report / location_entry
 *   user_attestation       – användaren attesterade dagen
 *   ai_analysis            – analyze-unclear-segment levererat resultat
 *   rules_changed          – regelmotor uppdaterad / boost-policy ändrad
 *   manual                 – ad-hoc anrop från admin UI
 *
 * Regler:
 *   • Låsta/godkända dagar (day_attestations) ändras INTE automatiskt.
 *     Rebuild loggar att den hoppade över dagen istället.
 *   • Admin-overrides (manual edits) respekteras: rebuild rör aldrig
 *     time_reports/location_time_entries direkt — den triggar bara
 *     omberäkning av snapshot-cachen i day-timeline-engine och loggar.
 *   • Audit trail bevaras alltid (append-only).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  logDayDecision,
  isDayLocked,
  type DecisionActor,
} from "../_shared/day-decision-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RebuildReason =
  | "late_ping"
  | "geofence_changed"
  | "admin_edit"
  | "user_attestation"
  | "ai_analysis"
  | "rules_changed"
  | "manual";

interface RebuildRequest {
  staffId: string;
  date: string; // YYYY-MM-DD
  reason: RebuildReason;
  actor?: DecisionActor;
  segmentId?: string;
  details?: Record<string, unknown>;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function validate(body: unknown): { ok: true; value: RebuildRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body_required" };
  const b = body as Record<string, unknown>;
  if (typeof b.staffId !== "string" || b.staffId.length < 8) return { ok: false, error: "staffId_required" };
  if (typeof b.date !== "string" || !isValidDate(b.date)) return { ok: false, error: "date_invalid" };
  const validReasons: RebuildReason[] = [
    "late_ping","geofence_changed","admin_edit","user_attestation","ai_analysis","rules_changed","manual",
  ];
  if (typeof b.reason !== "string" || !validReasons.includes(b.reason as RebuildReason)) {
    return { ok: false, error: "reason_invalid" };
  }
  return {
    ok: true,
    value: {
      staffId: b.staffId,
      date: b.date,
      reason: b.reason as RebuildReason,
      actor: (b.actor as DecisionActor) ?? "system",
      segmentId: typeof b.segmentId === "string" ? b.segmentId : undefined,
      details: (b.details as Record<string, unknown>) ?? {},
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing_auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let parsed: RebuildRequest;
  try {
    const json = await req.json();
    const v = validate(json);
    if (!v.ok) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    parsed = v.value;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: staff, error: staffErr } = await admin
    .from("staff_members")
    .select("id, organization_id, name")
    .eq("id", parsed.staffId)
    .maybeSingle();
  if (staffErr || !staff) {
    return new Response(JSON.stringify({ error: "staff_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const orgId = staff.organization_id as string;

  const lock = await isDayLocked(admin, {
    staffId: parsed.staffId,
    dayDate: parsed.date,
  });

  let snapshotResult: unknown = null;
  let snapshotError: string | null = null;

  if (!lock.locked) {
    try {
      const url = `${SUPABASE_URL}/functions/v1/day-timeline-engine`;
      const engineSecret = Deno.env.get("CRON_SECRET") ?? "";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          // day-timeline-engine kräver antingen user-JWT eller x-engine-secret;
          // service-role bearer räcker inte — använd CRON_SECRET för server-till-server.
          ...(engineSecret ? { "x-engine-secret": engineSecret } : {}),
        },
        body: JSON.stringify({
          action: "compute",
          staffId: parsed.staffId,
          date: parsed.date,
          reason: `rebuild:${parsed.reason}`,
        }),
      });
      if (!resp.ok) {
        snapshotError = `engine_${resp.status}`;
      } else {
        snapshotResult = await resp.json().catch(() => ({}));
      }
    } catch (err) {
      snapshotError = err instanceof Error ? err.message : "unknown";
    }
  }

  const { id: auditId } = await logDayDecision(admin, {
    organizationId: orgId,
    staffId: parsed.staffId,
    dayDate: parsed.date,
    segmentId: parsed.segmentId,
    actor: parsed.actor ?? "system",
    action: lock.locked ? "rebuild_skipped_locked" : "rebuild_executed",
    before: null,
    after: { snapshotResult, snapshotError },
    reason: lock.locked
      ? `${parsed.reason}; ${lock.reason}`
      : parsed.reason,
    confidence: null,
    sourceFunction: "rebuild-staff-day",
  });

  return new Response(
    JSON.stringify({
      ok: true,
      locked: lock.locked,
      lock_reason: lock.reason ?? null,
      snapshot_error: snapshotError,
      audit_id: auditId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
