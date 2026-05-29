/**
 * WeekFlowReportRowsMini — kompakt rendering av rapport-rader (work/travel)
 * exakt enligt GPS-satellitens panel-format. Används i Tid & Lön-matriscellen
 * och kan återanvändas i andra kompakta vyer.
 *
 * Förväntar sig rader med samma form som get-staff-time-week-matrix returnerar
 * (CellRow) eller WeekFlowRow.
 */
import { cn } from "@/lib/utils";

export interface MiniReportRow {
  kind: "work" | "travel" | "private" | "unknown_place" | "gps_gap" | "other";
  label: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
  fromLabel?: string | null;
  toLabel?: string | null;
}

interface Props {
  rows: MiniReportRow[];
  maxRows?: number;
  compact?: boolean;
  className?: string;
}

function hm(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "–";
  }
}

function dur(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function dotClass(kind: MiniReportRow["kind"]): string {
  switch (kind) {
    case "work": return "bg-emerald-500";
    case "travel": return "bg-blue-500";
    case "gps_gap": return "bg-amber-500";
    case "unknown_place": return "bg-slate-400";
    case "private": return "bg-violet-400";
    default: return "bg-muted-foreground";
  }
}

function labelFor(r: MiniReportRow): string {
  if (r.kind === "travel" && (r.fromLabel || r.toLabel)) {
    return `Resa ${r.fromLabel ?? "?"} → ${r.toLabel ?? "?"}`;
  }
  return r.label || (r.kind === "work" ? "Arbete" : r.kind);
}

export default function WeekFlowReportRowsMini({ rows, maxRows = 4, compact = true, className }: Props) {
  if (!rows || rows.length === 0) return null;
  const shown = rows.slice(0, maxRows);
  const extra = rows.length - shown.length;
  return (
    <ul className={cn("flex flex-col gap-0.5 w-full", className)}>
      {shown.map((r, i) => (
        <li
          key={i}
          className={cn(
            "flex items-center gap-1.5 text-foreground/90",
            compact ? "text-[10.5px] leading-tight" : "text-xs leading-snug",
          )}
        >
          <span className={cn("inline-block rounded-full shrink-0", dotClass(r.kind), compact ? "h-1.5 w-1.5" : "h-2 w-2")} />
          <span className="truncate min-w-0 flex-1" title={labelFor(r)}>{labelFor(r)}</span>
          <span className="tabular-nums opacity-70 shrink-0">{hm(r.startIso)}–{hm(r.endIso)}</span>
          <span className="tabular-nums font-semibold shrink-0 w-[44px] text-right">{dur(r.minutes)}</span>
        </li>
      ))}
      {extra > 0 && (
        <li className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>+{extra} rader</li>
      )}
    </ul>
  );
}
