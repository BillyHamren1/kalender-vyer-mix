import { cn } from "@/lib/utils";
import type { SiteScanStatus } from "@/features/site-scans/types";

export type ScanStatus = SiteScanStatus;

const statusConfig: Record<ScanStatus, { label: string; dotClass: string; bgClass: string; textClass: string }> = {
  draft:      { label: "Draft",      dotClass: "bg-[hsl(var(--status-draft))]",      bgClass: "bg-[hsl(var(--status-draft)/0.12)]",      textClass: "text-[hsl(var(--status-draft))]" },
  uploading:  { label: "Uploading",  dotClass: "bg-[hsl(var(--status-uploading))]",  bgClass: "bg-[hsl(var(--status-uploading)/0.12)]",  textClass: "text-[hsl(var(--status-uploading))]" },
  uploaded:   { label: "Uploaded",   dotClass: "bg-[hsl(var(--status-uploaded))]",   bgClass: "bg-[hsl(var(--status-uploaded)/0.12)]",   textClass: "text-[hsl(var(--status-uploaded))]" },
  processing: { label: "Processing", dotClass: "bg-[hsl(var(--status-processing))]", bgClass: "bg-[hsl(var(--status-processing)/0.12)]", textClass: "text-[hsl(var(--status-processing))]" },
  ready:      { label: "Ready",      dotClass: "bg-[hsl(var(--status-ready))]",      bgClass: "bg-[hsl(var(--status-ready)/0.12)]",      textClass: "text-[hsl(var(--status-ready))]" },
  failed:     { label: "Failed",     dotClass: "bg-[hsl(var(--status-failed))]",     bgClass: "bg-[hsl(var(--status-failed)/0.12)]",     textClass: "text-[hsl(var(--status-failed))]" },
  archived:   { label: "Archived",   dotClass: "bg-[hsl(var(--status-archived))]",   bgClass: "bg-[hsl(var(--status-archived)/0.12)]",   textClass: "text-[hsl(var(--status-archived))]" },
};

interface StatusBadgeProps {
  status: ScanStatus;
  className?: string;
  showDot?: boolean;
}

const StatusBadge = ({ status, className, showDot = true }: StatusBadgeProps) => {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium font-mono",
        config.bgClass,
        config.textClass,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            config.dotClass,
            status === "processing" && "animate-pulse-glow",
            status === "uploading" && "animate-pulse-glow"
          )}
        />
      )}
      {config.label}
    </span>
  );
};

export default StatusBadge;
