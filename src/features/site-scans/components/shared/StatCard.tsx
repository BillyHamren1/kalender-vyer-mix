import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
}

const StatCard = ({ label, value, icon: Icon, trend, className }: StatCardProps) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 flex items-start gap-4 transition-colors hover:border-primary/20",
        className
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold font-heading mt-0.5 leading-none">{value}</p>
        {trend && <p className="text-xs text-muted-foreground mt-1.5 font-mono">{trend}</p>}
      </div>
    </div>
  );
};

export default StatCard;
