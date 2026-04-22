import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
};

export default function PageShell({ children, className, title, description, badge }: PageShellProps) {
  return (
    <div className={className ?? "container mx-auto p-6 space-y-6"}>
      {(title || description || badge) && (
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            {title && <h1 className="text-2xl font-semibold">{title}</h1>}
            {badge}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </header>
      )}
      {children}
    </div>
  );
}
