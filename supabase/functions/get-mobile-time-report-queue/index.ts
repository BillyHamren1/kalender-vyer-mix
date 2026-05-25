// get-mobile-time-report-queue
// =============================================================================
// Returnerar en kompakt rapportkö för mobilens /m/report.
// Källa: staff_day_submissions (+ staff_day_report_cache vid behov)
// + en lättviktig kontroll om det finns några GPS-pings för dagen.
//
// Rör ALDRIG: time_reports, workdays, location_time_entries, travel_time_logs,
// day_attestations, active_time_registrations.

import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";

const TZ = "Europe/Stockholm";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LOOKBACK = 14;

const WEEKDAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayStockholm(): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function addDaysIso(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function dayParts(dateStr: string): { weekdayLabel: string; dayLabel: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekdayLabel: WEEKDAYS[dt.getUTCDay()],
    dayLabel: `${d} ${MONTHS[m - 1]}`,
  };
}

function stockholmDateOf(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
}

function stockholmHHmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
  return /^\d{2}:\d{2}$/.test(parts) ? parts : null;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type QueueStatus =
  | "correction_requested"
  | "needs_submit"
  | "manual_needed"
  | "submitted"
  | "edited"
  | "needs_user_attention"
  | "needs_control"
  | "ai_flagged"
  | "approved"
  | "payroll_approved"
  | "rejected"
  | "withdrawn";

function statusLabel(s: QueueStatus): string {
  switch (s) {
    case "correction_requested": return "Behöver kompletteras";
    case "needs_submit": return "Väntar på dig";
    case "manual_needed": return "Rapportera manuellt";
    case "submitted": return "Väntar attest";
    case "edited": return "Väntar attest · ändrad";
    case "needs_user_attention": return "Behöver din uppmärksamhet";
    case "needs_control": return "Väntar kontroll";
    case "ai_flagged": return "Väntar kontroll";
    case "approved": return "Godkänd";
    case "payroll_approved": return "Godkänd";
    case "rejected": return "Avvisad";
    case "withdrawn": return "Återkallad";
  }
}

function priorityFor(s: QueueStatus): number {
  switch (s) {
    case "correction_requested": return 0;
    case "needs_user_attention": return 1;
    case "needs_submit": return 2;
    case "manual_needed": return 3;
    case "needs_control":
    case "ai_flagged":
    case "edited":
    case "submitted": return 4;
    case "approved":
    case "payroll_approved": return 5;
    case "rejected":
    case "withdrawn": return 6;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { staffId?: string; from?: string | null; to?: string | null };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const staffId = String(body.staffId ?? "").trim();
  if (!staffId) return json({ error: "staffId required" }, 400);

  const today = todayStockholm();
  let to = body.to && ISO_DATE.test(body.to) ? body.to : today;
  let from = body.from && ISO_DATE.test(body.from) ? body.from : addDaysIso(to, -(DEFAULT_LOOKBACK - 1));
  if (from > to) [from, to] = [to, from];

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return json({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return json({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;

  // ── 1) Submissions för intervallet ──────────────────────────
  const submissionsMap = new Map<string, any>();
  try {
    const { data } = await admin
      .from("staff_day_submissions")
      .select(
        "id, date, status, source, submitted_at, review_comment, requested_start_at, " +
        "requested_end_at, start_time, end_time, break_minutes, source_summary_json",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    for (const row of (data ?? []) as any[]) {
      submissionsMap.set(String(row.date), row);
    }
  } catch (e) {
    console.error("[queue] submissions load failed", e);
  }

  // ── 2) Cache (engine-förslag finns?) ────────────────────────
  const cacheDates = new Set<string>();
  try {
    const { data } = await admin
      .from("staff_day_report_cache")
      .select("date")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("date", from)
      .lte("date", to);
    for (const row of (data ?? []) as any[]) {
      if (row?.date) cacheDates.add(String(row.date));
    }
  } catch (_e) {
    // tabellen kan saknas i miljön — det är ok
  }

  // ── 3) GPS-pings: en endaste lättviktig query ───────────────
  const gpsDates = new Set<string>();
  try {
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;
    const { data } = await admin
      .from("staff_location_history")
      .select("recorded_at")
      .eq("staff_id", staffId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .limit(5000);
    for (const r of (data ?? []) as any[]) {
      const d = stockholmDateOf(String(r.recorded_at));
      if (d) gpsDates.add(d);
    }
  } catch (e) {
    console.error("[queue] pings probe failed", e);
  }

  // ── 4) Bygg dagar ───────────────────────────────────────────
  const days: any[] = [];
  let cursor = from;
  while (cursor <= to) {
    const sub = submissionsMap.get(cursor);
    const hasSubmission = !!sub;
    const hasEngineSuggestion = cacheDates.has(cursor);
    const hasGps = gpsDates.has(cursor);

    let status: QueueStatus;
    if (hasSubmission) {
      const s = String(sub.status ?? "submitted");
      const allowed: QueueStatus[] = [
        "submitted", "edited", "needs_user_attention", "needs_control",
        "ai_flagged", "correction_requested", "approved", "payroll_approved",
        "rejected", "withdrawn",
      ];
      status = (allowed.includes(s as QueueStatus) ? s : "submitted") as QueueStatus;
    } else if (hasEngineSuggestion || hasGps) {
      status = "needs_submit";
    } else {
      status = "manual_needed";
    }

    let totalMinutes = 0;
    if (sub) {
      const summary = sub.source_summary_json as any;
      totalMinutes = Number(summary?.totalDurationMinutes ?? 0);
      if (!totalMinutes && sub.requested_start_at && sub.requested_end_at) {
        const ms = Date.parse(sub.requested_end_at) - Date.parse(sub.requested_start_at);
        if (Number.isFinite(ms) && ms > 0) {
          totalMinutes = Math.max(
            0,
            Math.round(ms / 60000) - Number(sub.break_minutes ?? 0),
          );
        }
      }
    }

    const startLabel = sub
      ? (stockholmHHmm(sub.requested_start_at) ?? (sub.start_time ? String(sub.start_time).slice(0, 5) : null))
      : null;
    const endLabel = sub
      ? (stockholmHHmm(sub.requested_end_at) ?? (sub.end_time ? String(sub.end_time).slice(0, 5) : null))
      : null;

    const isLocked = status === "approved" || status === "payroll_approved";
    const needsAction =
      status === "correction_requested" ||
      status === "needs_user_attention" ||
      status === "needs_submit" ||
      status === "manual_needed";

    const parts = dayParts(cursor);
    days.push({
      date: cursor,
      weekdayLabel: parts.weekdayLabel,
      dayLabel: parts.dayLabel,
      status,
      statusLabel: statusLabel(status),
      priority: priorityFor(status),
      hasSubmission,
      hasEngineSuggestion,
      hasGps,
      needsAction,
      totalMinutes,
      totalLabel: totalMinutes > 0 ? fmtDuration(totalMinutes) : "",
      startLabel,
      endLabel,
      source: sub?.source ?? null,
      submissionId: sub?.id ?? null,
      reviewComment: sub?.review_comment ?? null,
      canSubmit: !isLocked,
      canEdit: !isLocked,
      canOpen: true,
    });

    cursor = addDaysIso(cursor, 1);
  }

  // Sortera: priority först, sedan datum desc (närmast idag först inom samma prio)
  days.sort((a, b) => a.priority - b.priority || (a.date < b.date ? 1 : -1));

  return json({
    staffId,
    from,
    to,
    days,
  });
});
