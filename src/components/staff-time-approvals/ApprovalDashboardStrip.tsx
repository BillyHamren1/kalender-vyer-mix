import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2,
  AlertTriangle,
  Inbox,
  Sparkles,
  ChevronRight,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Personal-statuskort för tidrapport-attest.
 * Visar per-personal status, antal väntande rapporter, snabb attest-åtkomst
 * och pulsande indikator för nyinkomna rapporter (senaste 24h).
 */

interface Props {
  onOpenStaff?: (staffId: string) => void;
}

interface StaffRow {
  staff_id: string;
  staff_name: string;
  staff_color: string | null;
  pending: number;
  newLast24h: number;
  needsAttention: number;
  approved: number;
  totalWeek: number;
  latestSubmittedAt: string | null;
  latestStatus: string | null;
  urgency: number;
}

const PENDING_STATUSES = ["submitted", "edited", "ai_flagged", "needs_control"];
const ATTENTION_STATUSES = ["needs_user_attention", "correction_requested", "ai_flagged"];
const APPROVED_STATUSES = ["approved", "payroll_approved"];

const STATUS_LABEL: Record<string, string> = {
  submitted: "Inkommen",
  edited: "Redigerad",
  ai_flagged: "AI-flagg",
  needs_control: "Behöver kontroll",
  needs_user_attention: "Väntar svar",
  correction_requested: "Komplettering",
  approved: "Godkänd",
  payroll_approved: "Utbetald",
};

async function fetchStaffStatus(): Promise<{ rows: StaffRow[]; totalNew24h: number }> {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sinceWeek = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [subsRes, staffRes] = await Promise.all([
    supabase
      .from("staff_day_submissions")
      .select("id, staff_id, date, status, submitted_at, created_at, reviewed_at")
      .gte("created_at", sinceWeek)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase.from("staff_members").select("id, name, color").eq("is_active", true),
  ]);

  const staffById = new Map<string, { name: string; color: string | null }>(
    (staffRes.data || []).map((s: any) => [s.id, { name: s.name, color: s.color ?? null }]),
  );

  const grouped = new Map<string, StaffRow>();
  let totalNew24h = 0;

  for (const s of (subsRes.data || []) as any[]) {
    const staff = staffById.get(s.staff_id);
    if (!staff) continue;
    let row = grouped.get(s.staff_id);
    if (!row) {
      row = {
        staff_id: s.staff_id,
        staff_name: staff.name,
        staff_color: staff.color,
        pending: 0,
        newLast24h: 0,
        needsAttention: 0,
        approved: 0,
        totalWeek: 0,
        latestSubmittedAt: null,
        latestStatus: null,
        urgency: 0,
      };
      grouped.set(s.staff_id, row);
    }
    row.totalWeek += 1;
    if (PENDING_STATUSES.includes(s.status)) row.pending += 1;
    if (ATTENTION_STATUSES.includes(s.status)) row.needsAttention += 1;
    if (APPROVED_STATUSES.includes(s.status)) row.approved += 1;
    if (s.created_at >= since24h) {
      row.newLast24h += 1;
      totalNew24h += 1;
    }
    const ts = s.submitted_at ?? s.created_at;
    if (!row.latestSubmittedAt || ts > row.latestSubmittedAt) {
      row.latestSubmittedAt = ts;
      row.latestStatus = s.status;
    }
  }

  for (const r of grouped.values()) {
    r.urgency = r.needsAttention * 100 + r.pending * 10 + r.newLast24h;
  }

  const rows = Array.from(grouped.values())
    .filter((r) => r.pending > 0 || r.needsAttention > 0 || r.newLast24h > 0)
    .sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      return (b.latestSubmittedAt ?? "").localeCompare(a.latestSubmittedAt ?? "");
    });

  return { rows, totalNew24h };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const StaffStatusCard: React.FC<{ row: StaffRow; onOpen?: () => void }> = ({ row, onOpen }) => {
  const urgent = row.needsAttention > 0;
  const hasPending = row.pending > 0;
  const isNew = row.newLast24h > 0;

  const accent = urgent
    ? "from-rose-500/15 to-transparent border-rose-500/30"
    : hasPending
      ? "from-amber-500/15 to-transparent border-amber-500/30"
      : "from-emerald-500/10 to-transparent border-border/60";

  const dotColor = row.staff_color || "hsl(var(--primary))";

  return (
    <div
      className={cn(
        "group relative w-[260px] shrink-0 overflow-hidden rounded-2xl border bg-card/90 backdrop-blur-sm",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer",
        accent,
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70")} />
      {isNew && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
        </span>
      )}
      <div className="relative p-3.5">
        <div className="flex items-start gap-2.5">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ring-2 ring-background shadow-sm"
            style={{ background: dotColor }}
          >
            {initials(row.staff_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-foreground truncate">{row.staff_name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {row.latestSubmittedAt
                ? `${row.latestStatus ? STATUS_LABEL[row.latestStatus] ?? row.latestStatus : "—"} · ${formatDistanceToNow(
                    new Date(row.latestSubmittedAt),
                    { addSuffix: true, locale: sv },
                  )}`
                : "Ingen aktivitet"}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Stat
            value={row.pending}
            label="väntar"
            tone={hasPending ? "amber" : "muted"}
            icon={Inbox}
          />
          <Stat
            value={row.needsAttention}
            label="åtgärd"
            tone={urgent ? "rose" : "muted"}
            icon={AlertTriangle}
          />
          <Stat
            value={row.approved}
            label="klara"
            tone={row.approved > 0 ? "emerald" : "muted"}
            icon={CheckCircle2}
          />
        </div>

        <Button
          size="sm"
          variant={urgent || hasPending ? "default" : "outline"}
          className="w-full mt-3 h-8 text-xs gap-1.5"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
        >
          {urgent ? "Granska svar" : hasPending ? "Attestera" : "Öppna vecka"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

const Stat: React.FC<{
  value: number;
  label: string;
  tone: "amber" | "rose" | "emerald" | "muted";
  icon: React.ComponentType<{ className?: string }>;
}> = ({ value, label, tone, icon: Icon }) => {
  const toneStyles = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    muted: "bg-muted/40 text-muted-foreground ring-border/40",
  }[tone];
  return (
    <div className={cn("rounded-lg ring-1 px-1.5 py-1 text-center", toneStyles)}>
      <div className="flex items-center justify-center gap-1">
        <Icon className="h-3 w-3 opacity-70" />
        <span className="text-sm font-semibold tabular-nums leading-none">{value}</span>
      </div>
      <div className="text-[9px] uppercase tracking-wide opacity-80 mt-0.5">{label}</div>
    </div>
  );
};

export const ApprovalDashboardStrip: React.FC<Props> = ({ onOpenStaff }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["approval-staff-status-strip"],
    queryFn: fetchStaffStatus,
    refetchInterval: 45_000,
  });

  const rows = data?.rows ?? [];
  const summary = useMemo(() => {
    const totalPending = rows.reduce((acc, r) => acc + r.pending, 0);
    const totalAttention = rows.reduce((acc, r) => acc + r.needsAttention, 0);
    return { totalPending, totalAttention, totalNew: data?.totalNew24h ?? 0 };
  }, [rows, data]);

  return (
    <section className="px-5 pt-4 pb-2">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Personalstatus</h3>
          <span className="text-xs text-muted-foreground">
            ({rows.length} med aktivitet)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {summary.totalNew > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20 font-medium">
              <Sparkles className="h-3 w-3" />
              {summary.totalNew} nya 24h
            </span>
          )}
          {summary.totalPending > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20 font-medium">
              <Inbox className="h-3 w-3" />
              {summary.totalPending} väntar
            </span>
          )}
          {summary.totalAttention > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20 font-medium">
              <AlertTriangle className="h-3 w-3" />
              {summary.totalAttention} åtgärd
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-[260px] h-[156px] shrink-0 rounded-2xl bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-5 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/70 mb-2" />
          <div className="text-sm font-medium text-foreground">Allt är hanterat</div>
          <div className="text-xs text-muted-foreground mt-1">
            Inga rapporter väntar attest just nu.
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-border">
          {rows.map((r) => (
            <div key={r.staff_id} className="snap-start">
              <StaffStatusCard row={r} onOpen={() => onOpenStaff?.(r.staff_id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ApprovalDashboardStrip;
