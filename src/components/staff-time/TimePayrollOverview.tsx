import React from "react";
import {
  ClipboardCheck,
  Clock,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { useStaffWeeklyTimeApprovals } from "@/hooks/staff/useStaffWeeklyTimeApprovals";

interface Props {
  onNavigateTab: (tab: string) => void;
}

const Stat: React.FC<{ label: string; value: number | string; tone?: "default" | "amber" | "emerald" | "indigo" }> = ({
  label,
  value,
  tone = "default",
}) => {
  const cls =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : tone === "indigo"
      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200"
      : "border-border/70 bg-card";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
};

const TimePayrollOverview: React.FC<Props> = ({ onNavigateTab }) => {
  const today = new Date();
  const ws = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const we = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading } = useStaffWeeklyTimeApprovals({
    weekStart: ws,
    weekEnd: we,
    staffId: null,
    status: null,
  });

  const rows = (data?.rows ?? []) as any[];

  let pendingStaff = 0;
  let pendingAdmin = 0;
  let needsFix = 0;
  let approved = 0;

  for (const r of rows) {
    const s = r?.status ?? r?.day_status ?? "";
    if (s === "pending_staff_attest" || s === "submitted") pendingStaff++;
    else if (s === "pending_admin_attest" || s === "submitted_pending_admin") pendingAdmin++;
    else if (s === "correction_requested") needsFix++;
    else if (s === "approved" || s === "payroll_approved") approved++;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Vecka {format(today, "w")} · {format(today, "d MMM", { locale: sv })}–{format(endOfWeek(today, { weekStartsOn: 1 }), "d MMM yyyy", { locale: sv })}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Kort lägesbild över denna vecka. Hoppa in i Attest för att granska.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Väntar personalattest" value={isLoading ? "–" : pendingStaff} tone="indigo" />
        <Stat label="Väntar adminattest" value={isLoading ? "–" : pendingAdmin} tone="amber" />
        <Stat label="Behöver komplettering" value={isLoading ? "–" : needsFix} tone="amber" />
        <Stat label="Godkända denna vecka" value={isLoading ? "–" : approved} tone="emerald" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4 flex flex-col gap-2 hover:border-purple-500/40 transition-colors">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-purple-600" />
            <div className="text-sm font-semibold">Attest</div>
          </div>
          <p className="text-xs text-muted-foreground">Granska veckans dagar per person, öppna GPS-underlag och godkänn.</p>
          <Button size="sm" className="mt-auto self-start gap-1.5" onClick={() => onNavigateTab("approvals")}>
            Öppna attest <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>

        <Card className="p-4 flex flex-col gap-2 hover:border-purple-500/40 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" />
            <div className="text-sm font-semibold">Rapporter</div>
          </div>
          <p className="text-xs text-muted-foreground">Bläddra rapporter per person och dag. Översikt över inskickad tid.</p>
          <Button size="sm" variant="outline" className="mt-auto self-start gap-1.5" onClick={() => onNavigateTab("reports")}>
            Visa rapporter <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>

        <Card className="p-4 flex flex-col gap-2 hover:border-purple-500/40 transition-colors">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-600" />
            <div className="text-sm font-semibold">Lön</div>
          </div>
          <p className="text-xs text-muted-foreground">Färdigt underlag av godkänd tid. Månadsrapport och löneperioder.</p>
          <Button size="sm" variant="outline" className="mt-auto self-start gap-1.5" onClick={() => onNavigateTab("payroll")}>
            Öppna löneunderlag <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Card>
      </div>

      <Card className="p-3 bg-muted/30 border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
          <div>
            Arbetsflöde: <strong>Översikt</strong> → <strong>Attest</strong> → person → dag → GPS-underlag vid behov → godkänn → <strong>Lön</strong>.
            GPS-kartan visas inte längre som egen sida i menyn – den öppnas direkt från en dag i attestflödet.
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TimePayrollOverview;
