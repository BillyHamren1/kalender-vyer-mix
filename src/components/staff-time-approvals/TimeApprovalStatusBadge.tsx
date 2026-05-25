import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Lock,
  AlertTriangle,
  HelpCircle,
  Clock3,
  Pencil,
  ShieldAlert,
  MessageSquareWarning,
  Ban,
} from "lucide-react";
import type { StaffDaySubmissionStatus } from "@/hooks/staff/useStaffWeeklyTimeApprovals";

interface Props {
  status: StaffDaySubmissionStatus;
  size?: "xs" | "sm";
  className?: string;
}

interface Spec {
  label: string;
  icon: React.ElementType;
  tone: string;
}

const SPEC: Record<string, Spec> = {
  submitted: { label: "Väntar attest", icon: Clock3, tone: "border-amber-500/40 text-amber-800 bg-amber-500/10 dark:text-amber-300" },
  edited: { label: "Redigerad", icon: Pencil, tone: "border-amber-500/40 text-amber-800 bg-amber-500/10 dark:text-amber-300" },
  ai_flagged: { label: "AI-flagg", icon: ShieldAlert, tone: "border-orange-500/40 text-orange-800 bg-orange-500/10 dark:text-orange-300" },
  needs_user_attention: { label: "Behöver svar", icon: HelpCircle, tone: "border-orange-500/40 text-orange-800 bg-orange-500/10 dark:text-orange-300" },
  needs_control: { label: "Kontroll", icon: AlertTriangle, tone: "border-orange-500/40 text-orange-800 bg-orange-500/10 dark:text-orange-300" },
  correction_requested: { label: "Begärt komplettering", icon: MessageSquareWarning, tone: "border-rose-500/40 text-rose-700 bg-rose-500/10 dark:text-rose-300" },
  approved: { label: "Godkänd", icon: CheckCircle2, tone: "border-emerald-500/40 text-emerald-700 bg-emerald-500/10 dark:text-emerald-300" },
  payroll_approved: { label: "Utbetalning", icon: Lock, tone: "border-emerald-600/50 text-emerald-800 bg-emerald-500/15 dark:text-emerald-200" },
  missing_report: { label: "Saknas", icon: Ban, tone: "border-border text-muted-foreground bg-muted/40" },
};

export const TimeApprovalStatusBadge: React.FC<Props> = ({ status, size = "xs", className }) => {
  const spec = SPEC[status] ?? {
    label: status,
    icon: HelpCircle,
    tone: "border-border text-muted-foreground",
  };
  const Icon = spec.icon;
  const sizing = size === "sm" ? "text-[11px] py-0.5 px-2" : "text-[10px] py-0 px-1.5";
  return (
    <Badge
      variant="outline"
      className={`gap-1 font-medium ${sizing} ${spec.tone} ${className ?? ""}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {spec.label}
    </Badge>
  );
};

export default TimeApprovalStatusBadge;
