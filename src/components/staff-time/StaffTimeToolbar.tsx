/**
 * StaffTimeToolbar — premium toolbar: veckonav · sök · statusfilter · avvikelsefilter.
 * Filterstate hanteras i parent. Ingen ny backend.
 */
import { ChevronLeft, ChevronRight, Search, Filter, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type StatusFilter = "all" | "gps_proposal" | "submitted_waiting_approval" | "correction_requested" | "approved" | "empty";

interface Props {
  weekStart: Date;
  weekEnd: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  query: string;
  setQuery: (q: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  onlyAnomalies: boolean;
  setOnlyAnomalies: (v: boolean) => void;
  rowCountFiltered: number;
  rowCountTotal: number;
}

export default function StaffTimeToolbar({
  weekStart,
  weekEnd,
  onPrev,
  onNext,
  onToday,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  onlyAnomalies,
  setOnlyAnomalies,
  rowCountFiltered,
  rowCountTotal,
}: Props) {
  return (
    <div className="px-4 pt-3">
      <div className="rounded-xl border border-border/60 bg-card shadow-sm px-3 py-2.5 flex flex-wrap items-center gap-2">
        {/* Week nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev} aria-label="Föregående vecka">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 min-w-[200px]">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground leading-none">
              Vecka {format(weekStart, "I")}
            </div>
            <div className="text-sm font-semibold tabular-nums leading-tight">
              {format(weekStart, "d MMM", { locale: sv })} – {format(weekEnd, "d MMM", { locale: sv })}
            </div>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext} aria-label="Nästa vecka">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-medium" onClick={onToday}>
            Idag
          </Button>
        </div>

        <div className="hidden md:block h-6 w-px bg-border mx-1" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök personal…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 text-xs w-[170px]">
            <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            <SelectItem value="gps_proposal">GPS-förslag</SelectItem>
            <SelectItem value="submitted_waiting_approval">Inskickat</SelectItem>
            <SelectItem value="correction_requested">Behöver komplettering</SelectItem>
            <SelectItem value="approved">Attesterat</SelectItem>
            <SelectItem value="empty">Saknar rapport</SelectItem>
          </SelectContent>
        </Select>

        {/* Anomaly toggle */}
        <Button
          type="button"
          variant={onlyAnomalies ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5",
            onlyAnomalies && "bg-amber-500 hover:bg-amber-600 text-white",
          )}
          onClick={() => setOnlyAnomalies(!onlyAnomalies)}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Endast avvikelser
        </Button>

        <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {rowCountFiltered === rowCountTotal
            ? `${rowCountTotal} ${rowCountTotal === 1 ? "person" : "personer"}`
            : `${rowCountFiltered} av ${rowCountTotal}`}
        </div>
      </div>
    </div>
  );
}
