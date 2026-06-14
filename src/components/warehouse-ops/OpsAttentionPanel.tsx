import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { OpsAttention } from "@/hooks/useWarehouseOpsRange";

interface Props {
  items: OpsAttention[];
}

const levelStyles: Record<OpsAttention["level"], { bg: string; icon: typeof AlertTriangle; color: string }> = {
  critical: { bg: "bg-red-500/5 border-red-500/30", icon: AlertCircle, color: "text-red-600" },
  warning: { bg: "bg-amber-500/5 border-amber-500/30", icon: AlertTriangle, color: "text-amber-600" },
  info: { bg: "bg-blue-500/5 border-blue-500/30", icon: Info, color: "text-blue-600" },
};

const OpsAttentionPanel = ({ items }: Props) => {
  const navigate = useNavigate();
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Inget kritiskt just nu — allt rullar enligt plan.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card mb-4 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Behöver uppmärksamhet
        </h2>
        <span className="text-xs text-muted-foreground">{items.length} st</span>
      </div>
      <ul className="divide-y divide-border/40">
        {items.map((it) => {
          const cfg = levelStyles[it.level];
          const Icon = cfg.icon;
          const clickable = !!it.jobId;
          return (
            <li
              key={it.id}
              onClick={() => clickable && navigate(`/warehouse/packing/${it.jobId}`)}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                cfg.bg,
                clickable && "cursor-pointer hover:bg-accent/40",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{it.title}</div>
                <div className="text-xs text-muted-foreground truncate">{it.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default OpsAttentionPanel;
