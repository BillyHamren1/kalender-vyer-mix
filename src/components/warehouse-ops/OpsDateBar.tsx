import { format, addDays } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarIcon, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { OpsMode } from "@/hooks/useWarehouseOpsRange";

interface Props {
  anchorDate: Date;
  mode: OpsMode;
  onChange: (date: Date, mode: OpsMode) => void;
  summary?: { jobsOut: number; jobsIn: number; peopleActive: number; lastScanAt: string | null };
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const OpsDateBar = ({ anchorDate, mode, onChange, summary }: Props) => {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  const presets: Array<{ label: string; date: Date; m: OpsMode; active: boolean }> = [
    { label: "Igår", date: yesterday, m: "day", active: mode === "day" && isSameDay(anchorDate, yesterday) },
    { label: "Idag", date: today, m: "day", active: mode === "day" && isSameDay(anchorDate, today) },
    { label: "Imorgon", date: tomorrow, m: "day", active: mode === "day" && isSameDay(anchorDate, tomorrow) },
    { label: "Vecka", date: anchorDate, m: "week", active: mode === "week" },
  ];

  const lastScan = summary?.lastScanAt ? new Date(summary.lastScanAt) : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 mb-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border/60 bg-background p-0.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(p.date, p.m)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                p.active
                  ? "bg-warehouse text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              {mode === "week"
                ? `v.${format(anchorDate, "ww", { locale: sv })} ${format(anchorDate, "yyyy")}`
                : format(anchorDate, "EEE d MMM", { locale: sv })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={anchorDate}
              onSelect={(d) => d && onChange(d, mode)}
              initialFocus
              weekStartsOn={1}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {summary && (
            <>
              <span className="hidden md:inline">
                <strong className="text-foreground">{summary.jobsOut}</strong> UT ·{" "}
                <strong className="text-foreground">{summary.jobsIn}</strong> IN ·{" "}
                <strong className="text-foreground">{summary.peopleActive}</strong> aktiva
              </span>
              {lastScan && (
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
                  Senaste scan {format(lastScan, "HH:mm")}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpsDateBar;
