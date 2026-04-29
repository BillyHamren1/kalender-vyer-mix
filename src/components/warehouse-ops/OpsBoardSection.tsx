import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon?: ReactNode;
  count: number;
  tone?: "default" | "active" | "danger" | "warn" | "ok";
  children: ReactNode;
  emptyHint?: string;
}

const toneClasses = {
  default: "text-foreground",
  active: "text-primary",
  danger: "text-destructive",
  warn: "text-amber-600",
  ok: "text-emerald-600",
} as const;

export default function OpsBoardSection({ title, icon, count, tone = "default", children, emptyHint }: Props) {
  return (
    <section className="mb-7">
      <header className="flex items-center gap-2 mb-3">
        <span className={cn("flex items-center gap-2 font-semibold text-sm uppercase tracking-wide", toneClasses[tone])}>
          {icon}
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums bg-muted/50 rounded-full px-2 py-0.5">
          {count}
        </span>
      </header>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">{emptyHint || "Inget att visa."}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{children}</div>
      )}
    </section>
  );
}
