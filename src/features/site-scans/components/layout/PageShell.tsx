import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export default function PageShell({ children, className }: PageShellProps) {
  return <div className={className ?? "container mx-auto p-6 space-y-6"}>{children}</div>;
}
