import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface DataSectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  noPadding?: boolean;
}

const DataSectionCard = ({
  title,
  description,
  actions,
  children,
  className,
  noPadding = false,
}: DataSectionCardProps) => {
  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold font-heading">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className={cn(!noPadding && "p-5")}>
        {children}
      </div>
    </div>
  );
};

export default DataSectionCard;
