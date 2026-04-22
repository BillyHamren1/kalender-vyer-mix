import { LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

const EmptyState = ({
  icon: Icon = Inbox,
  title = "Inga data ännu",
  description = "Data visas här när det finns tillgängligt.",
  action,
  className,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-elevated/50 py-16 px-6 text-center",
        className
      )}
    >
      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
