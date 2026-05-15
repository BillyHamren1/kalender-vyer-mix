// Lager 5.6 — Compute reminders for the staff member to approve/edit time.
// =============================================================================
// READ-ONLY. Skapar inga rader, ändrar inga tidrapporter, skickar inga pushar.
// Returnerar bara en lista med "remind"-objekt som UI:t visar som banner.
//
// Regler:
//   1. Gårdagen saknar submission (submitted/edited/approved) → submit_yesterday_pending
//   2. Idag: workday avslutad ELLER inga aktiva timers + display-block finns → submit_today_pending
//   3. Senaste submission har status needs_user_attention/ai_flagged → confirm_edits
//
// Anti-spam: dedupe_key per (staff,date,kind). Klienten lagrar dismissals i
// localStorage med TTL — backend räknar inte bort.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";

interface Body { staffId?: string }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function todayStockholm(): string {
  // Best-effort YYYY-MM-DD i Stockholm-tid. Funkar för Lager 5.6 påminnelser.
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}
function yesterday(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const SUBMITTED_STATUSES = new Set(["submitted", "edited", "approved"]);
const NEEDS_ATTENTION = new Set(["needs_user_attention", "ai_flagged"]);

interface Reminder {
  kind: "submit_yesterday_pending" | "submit_today_pending" | "confirm_edits";
  date: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  dedupeKey: string;
  linkPath: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  let body: Body = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  const requestedStaffId = body.staffId ?? null;

  const authResult = await authenticateStaffRequest(req, { requestedStaffId });
  if (!authResult.ok) return json(authResult.err.status, { ok: false, error: authResult.err.error });

  const staffIdToUse = requestedStaffId
    ?? (authResult.auth.mode === "mobile" ? authResult.auth.staffId : null);
  if (!staffIdToUse) return json(400, { ok: false, error: "staffId_required" });

  const access = await authorizeStaffAccess(authResult.auth, staffIdToUse);
  if (!access.ok) return json(access.err.status, { ok: false, error: access.err.error });

  const admin = authResult.auth.admin;
  const orgId = access.orgId;
  const today = todayStockholm();
  const yest = yesterday(today);

  const reminders: Reminder[] = [];

  // 1) Gårdagen saknar submission?
  try {
    const { data: yestSub } = await admin
      .from("staff_day_submissions")
      .select("status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffIdToUse)
      .eq("date", yest)
      .maybeSingle();
    const yestSubmitted = yestSub && SUBMITTED_STATUSES.has((yestSub as any).status);

    // Bara påminn om gårdagen om det fanns någon arbetsdags-aktivitet alls.
    let yestHadActivity = false;
    if (!yestSubmitted) {
      const { data: cache } = await admin
        .from("staff_day_report_cache")
        .select("display_blocks_json, summary_json")
        .eq("organization_id", orgId)
        .eq("staff_id", staffIdToUse)
        .eq("date", yest)
        .order("built_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const blocks = Array.isArray((cache as any)?.display_blocks_json)
        ? (cache as any).display_blocks_json
        : Array.isArray((cache as any)?.summary_json?.blocks)
          ? (cache as any).summary_json.blocks
          : [];
      yestHadActivity = blocks.length > 0;
    }

    if (!yestSubmitted && yestHadActivity) {
      reminders.push({
        kind: "submit_yesterday_pending",
        date: yest,
        title: "Glöm inte godkänna gårdagens tid",
        body: "Granska gårdagens dag i appen och skicka in den.",
        severity: "warning",
        dedupeKey: `submit_yesterday_pending:${staffIdToUse}:${yest}`,
        linkPath: `/m/report?date=${yest}`,
      });
    }
  } catch (e) {
    console.warn("[reminders] yesterday check failed", e);
  }

  // 2) Dagens dag är klar att godkänna (workday avslutad och submission saknas)?
  try {
    const { data: todaySub } = await admin
      .from("staff_day_submissions")
      .select("status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffIdToUse)
      .eq("date", today)
      .maybeSingle();
    const todaySubmitted = todaySub && SUBMITTED_STATUSES.has((todaySub as any).status);

    if (!todaySubmitted) {
      const { data: openWd } = await admin
        .from("active_time_registrations")
        .select("id, stopped_at")
        .eq("organization_id", orgId)
        .eq("staff_id", staffIdToUse)
        .is("stopped_at", null)
        .limit(1);
      const hasOpenTimer = Array.isArray(openWd) && openWd.length > 0;

      const { data: cache } = await admin
        .from("staff_day_report_cache")
        .select("display_blocks_json, summary_json")
        .eq("organization_id", orgId)
        .eq("staff_id", staffIdToUse)
        .eq("date", today)
        .order("built_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const blocks = Array.isArray((cache as any)?.display_blocks_json)
        ? (cache as any).display_blocks_json
        : Array.isArray((cache as any)?.summary_json?.blocks)
          ? (cache as any).summary_json.blocks
          : [];
      const hasBlocks = blocks.length > 0;

      if (!hasOpenTimer && hasBlocks) {
        reminders.push({
          kind: "submit_today_pending",
          date: today,
          title: "Din dag är klar att godkänna",
          body: "Tryck för att granska och skicka in dagens tider.",
          severity: "info",
          dedupeKey: `submit_today_pending:${staffIdToUse}:${today}`,
          linkPath: `/m/report?date=${today}`,
        });
      }
    }

    // 3) Behöver användaren bekräfta sina ändringar?
    if (todaySub && NEEDS_ATTENTION.has((todaySub as any).status)) {
      reminders.push({
        kind: "confirm_edits",
        date: today,
        title: "Din ändring behöver bekräftas",
        body: "AI flaggade din redigering. Lägg en kort förklaring och bekräfta.",
        severity: "critical",
        dedupeKey: `confirm_edits:${staffIdToUse}:${today}`,
        linkPath: `/m/report?date=${today}`,
      });
    }
  } catch (e) {
    console.warn("[reminders] today check failed", e);
  }

  return json(200, { ok: true, reminders, computedAt: new Date().toISOString() });
});
