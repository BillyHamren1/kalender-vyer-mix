/**
 * StaffTimeLegend — kompakt färglegend för Tid & Lön-vyn.
 */
import { cn } from "@/lib/utils";

interface Item {
  label: string;
  dot: string;
}

const STATUS_ITEMS: Item[] = [
  { label: "GPS-förslag", dot: "bg-violet-500" },
  { label: "Inskickat", dot: "bg-amber-500" },
  { label: "Behöver granskning", dot: "bg-rose-500" },
  { label: "Attesterat", dot: "bg-emerald-500" },
];

const BLOCK_ITEMS: Item[] = [
  { label: "Arbete", dot: "bg-emerald-500" },
  { label: "Resa", dot: "bg-blue-500" },
  { label: "GPS-glapp", dot: "bg-amber-500" },
  { label: "Okänd plats", dot: "bg-slate-400" },
  { label: "Natt/övertid", dot: "bg-violet-400" },
];

export default function StaffTimeLegend() {
  return (
    <div className="px-4 pb-4 pt-3">
      <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        {STATUS_ITEMS.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", i.dot)} />
            <span className="text-foreground/80">{i.label}</span>
          </span>
        ))}
        <span className="h-3 w-px bg-border mx-1 hidden sm:inline-block" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Block
        </span>
        {BLOCK_ITEMS.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", i.dot)} />
            <span className="text-foreground/80">{i.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
