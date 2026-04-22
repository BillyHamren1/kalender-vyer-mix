import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

const PageHeader = ({ title, description, actions, badge, className }: PageHeaderProps) => {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">{title}</h1>
          {badge}
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

export default PageHeader;
