import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Inbox,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Clock3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Premium dashboard strip för tidrapport-attest.
 * Visar KPI:er + senaste aktivitet. Ren read-only — all attest sker i listan nedanför.
 */

type Kpi = {
  key: string;
  label: string;
  value: number;
  hint?: string;
  tone: "amber" | "emerald" | "sky" | "rose";
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
};

interface RecentSubmission {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_color: string | null;
  date: string;
  status: string;
  submitted_at: string | null;
}

async function fetchDashboardData() {
  const today = new Date();
  const sinceIso = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgoIso = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [subsRes, staffRes] = await Promise.all([
    supabase
      .from("staff_day_submissions")
      .select("id, staff_id, date, status, submitted_at, reviewed_at, created_at")
      .gte("created_at", weekAgoIso)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from("staff_members").select("id, name, color"),
  ]);

  const staffById = new Map<string, { name: string; color: string | null }>(
    (staffRes.data || []).map((s: any) => [s.id, { name: s.name, color: s.color ?? null }]),
  );

  const subs = (subsRes.data || []) as Array<{
    id: string;
    staff_id: string;
    date: string;
    status: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;

  const pending = subs.filter((s) =>
    ["submitted", "edited", "ai_flagged", "needs_control", "needs_user_attention"].includes(
      s.status,
    ),
  );
  const newToday = subs.filter((s) => s.created_at >= sinceIso);
  const approvedWeek = subs.filter((s) =>
    ["approved", "payroll_approved"].includes(s.status),
  );
  const needsAttention = subs.filter((s) =>
    ["needs_user_attention", "ai_flagged", "correction_requested"].includes(s.status),
  );

  const recent: RecentSubmission[] = subs.slice(0, 8).map((s) => {
    const staff = staffById.get(s.staff_id);
    return {
      id: s.id,
      staff_id: s.staff_id,
      staff_name: staff?.name ?? "Okänd",
      staff_color: staff?.color ?? null,
      date: s.date,
      status: s.status,
      submitted_at: s.submitted_at ?? s.created_at,
    };
  });

  return {
    pending: pending.length,
    newToday: newToday.length,
    approvedWeek: approvedWeek.length,
    needsAttention: needsAttention.length,
    recent,
  };
}

const TONE_STYLES: Record<Kpi["tone"], { ring: string; chip: string; glow: string; text: string }> = {
  amber: {
    ring: "from-amber-500/20 via-amber-400/5 to-transparent",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    glow: "shadow-[0_8px_30px_-12px_hsl(38_92%_50%/0.35)]",
    text: "text-amber-700 dark:text-amber-300",
  },
  emerald: {
    ring: "from-emerald-500/20 via-emerald-400/5 to-transparent",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    glow: "shadow-[0_8px_30px_-12px_hsl(160_84%_39%/0.35)]",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  sky: {
    ring: "from-sky-500/20 via-sky-400/5 to-transparent",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20",
    glow: "shadow-[0_8px_30px_-12px_hsl(199_89%_48%/0.35)]",
    text: "text-sky-700 dark:text-sky-300",
  },
  rose: {
    ring: "from-rose-500/20 via-rose-400/5 to-transparent",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
    glow: "shadow-[0_8px_30px_-12px_hsl(346_77%_50%/0.35)]",
    text: "text-rose-700 dark:text-rose-300",
  },
};

const STATUS_LABEL: Record<string, { label: string; tone: Kpi["tone"] }> = {
  submitted: { label: "Inkommen", tone: "sky" },
  edited: { label: "Redigerad", tone: "sky" },
  ai_flagged: { label: "AI-flagg", tone: "amber" },
  needs_control: { label: "Behöver kontroll", tone: "amber" },
  needs_user_attention: { label: "Väntar svar", tone: "rose" },
  correction_requested: { label: "Komplettering", tone: "rose" },
  approved: { label: "Godkänd", tone: "emerald" },
  payroll_approved: { label: "Utbetald", tone: "emerald" },
};

const KpiCard: React.FC<{ kpi: Kpi }> = ({ kpi }) => {
  const tone = TONE_STYLES[kpi.tone];
  const Icon = kpi.icon;
  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-border",
        tone.glow,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60",
          tone.ring,
        )}
      />
      <div className="relative p-4 flex items-start gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl ring-1 flex items-center justify-center shrink-0",
            tone.chip,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {kpi.label}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className={cn("text-2xl font-semibold tabular-nums", tone.text)}>
              {kpi.value}
            </span>
            {kpi.hint && (
              <span className="text-xs text-muted-foreground truncate">{kpi.hint}</span>
            )}
          </div>
        </div>
        {kpi.to && (
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
  if (kpi.to) return <Link to={kpi.to}>{inner}</Link>;
  return inner;
};

export const ApprovalDashboardStrip: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["approval-dashboard-strip"],
    queryFn: fetchDashboardData,
    refetchInterval: 60_000,
  });

  const kpis: Kpi[] = [
    {
      key: "pending",
      label: "Att attestera",
      value: data?.pending ?? 0,
      hint: "rapporter väntar",
      tone: "amber",
      icon: Inbox,
    },
    {
      key: "new",
      label: "Nya senaste 24h",
      value: data?.newToday ?? 0,
      hint: "inkomna",
      tone: "sky",
      icon: Sparkles,
    },
    {
      key: "attention",
      label: "Inkomna svar / åtgärd",
      value: data?.needsAttention ?? 0,
      hint: "personalåterkoppling",
      tone: "rose",
      icon: AlertTriangle,
    },
    {
      key: "approved",
      label: "Godkända denna vecka",
      value: data?.approvedWeek ?? 0,
      hint: "senaste 7 dagar",
      tone: "emerald",
      icon: CheckCircle2,
    },
  ];

  return (
    <section className="px-5 pt-4 pb-2">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(260px,1.1fr)] gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}

        {/* Recent activity feed */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm xl:row-span-1">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Senaste aktivitet
                </h3>
              </div>
              {data && (
                <span className="text-[10px] text-muted-foreground">
                  {data.recent.length} händelser
                </span>
              )}
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : !data || data.recent.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3">
                Inga rapporter senaste veckan.
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 -mr-1">
                {data.recent.map((r) => {
                  const meta = STATUS_LABEL[r.status] ?? { label: r.status, tone: "sky" as const };
                  const tone = TONE_STYLES[meta.tone];
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-xs py-1 px-1.5 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <span
                        className="h-2 w-2 rounded-full ring-1 ring-border/60 shrink-0"
                        style={{ background: r.staff_color || "hsl(var(--muted-foreground))" }}
                      />
                      <span className="font-medium text-foreground truncate flex-1">
                        {r.staff_name}
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] ring-1 font-medium",
                          tone.chip,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {r.submitted_at
                          ? formatDistanceToNow(new Date(r.submitted_at), {
                              addSuffix: true,
                              locale: sv,
                            })
                          : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ApprovalDashboardStrip;
