import { useMemo } from "react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, isBefore, isWithinInterval, isToday as isTodayFn } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Ban, Clock, UserX, CalendarDays, HelpCircle, CheckCircle2,
  User, X, Filter, AlertTriangle, Zap,
} from "lucide-react";
import type { EstablishmentTask, TaskStatus, TaskPriority, TaskReadiness } from "@/services/establishmentTaskService";
import type { DateRange } from "react-day-picker";

// ── Filter types ──────────────────────────────────────────────
export interface PlanningFilters {
  quickFilter: QuickFilter | null;
  assignedTo: string | null;     // staff id or "__unassigned__"
  status: TaskStatus | null;
  readiness: TaskReadiness | null;
  priority: TaskPriority | null;
  dateRange: { from: Date; to: Date } | null;
}

export type QuickFilter =
  | "my_tasks"
  | "overdue"
  | "blocked"
  | "today"
  | "this_week"
  | "unassigned"
  | "completed"
  | "needs_decision";

export const EMPTY_FILTERS: PlanningFilters = {
  quickFilter: null,
  assignedTo: null,
  status: null,
  readiness: null,
  priority: null,
  dateRange: null,
};

// ── Filter logic (pure) ───────────────────────────────────────
export function applyFilters(
  tasks: EstablishmentTask[],
  filters: PlanningFilters,
  currentUserId?: string | null,
): EstablishmentTask[] {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  return tasks.filter(task => {
    // Quick filters
    if (filters.quickFilter) {
      switch (filters.quickFilter) {
        case "my_tasks": {
          const ids = task.assigned_to_ids?.length ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []);
          if (!currentUserId || !ids.includes(currentUserId)) return false;
          break;
        }
        case "overdue":
          if (task.status === "done") return false;
          if (!task.end_date || !isBefore(startOfDay(new Date(task.end_date)), today)) return false;
          break;
        case "blocked":
          if (task.status !== "blocked") return false;
          break;
        case "today": {
          if (task.status === "done") return false;
          const s = task.start_date ? startOfDay(new Date(task.start_date)) : null;
          const e = task.end_date ? endOfDay(new Date(task.end_date)) : null;
          if (!s || !e) return false;
          if (!isWithinInterval(today, { start: s, end: e }) && !isTodayFn(s)) return false;
          break;
        }
        case "this_week": {
          if (task.status === "done") return false;
          const s = task.start_date ? startOfDay(new Date(task.start_date)) : null;
          const e = task.end_date ? endOfDay(new Date(task.end_date)) : null;
          if (!s || !e) return false;
          const overlaps = s <= weekEnd && e >= weekStart;
          if (!overlaps) return false;
          break;
        }
        case "unassigned": {
          const ids = task.assigned_to_ids?.length ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []);
          if (ids.length > 0) return false;
          if (task.status === "done") return false;
          break;
        }
        case "completed":
          if (task.status !== "done") return false;
          break;
        case "needs_decision":
          if (!task.decision_needed || task.status === "done") return false;
          break;
      }
    }

    // Dropdown filters
    if (filters.assignedTo) {
      const ids = task.assigned_to_ids?.length ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []);
      if (filters.assignedTo === "__unassigned__") {
        if (ids.length > 0) return false;
      } else {
        if (!ids.includes(filters.assignedTo)) return false;
      }
    }

    if (filters.status && task.status !== filters.status) return false;
    if (filters.readiness && task.readiness !== filters.readiness) return false;
    if (filters.priority && task.priority !== filters.priority) return false;

    if (filters.dateRange) {
      const s = task.start_date ? startOfDay(new Date(task.start_date)) : null;
      const e = task.end_date ? endOfDay(new Date(task.end_date)) : null;
      if (!s || !e) return false;
      const overlaps = s <= endOfDay(filters.dateRange.to) && e >= startOfDay(filters.dateRange.from);
      if (!overlaps) return false;
    }

    return true;
  });
}

export function hasActiveFilters(filters: PlanningFilters): boolean {
  return !!(
    filters.quickFilter ||
    filters.assignedTo ||
    filters.status ||
    filters.readiness ||
    filters.priority ||
    filters.dateRange
  );
}

// ── Quick filter config ───────────────────────────────────────
const QUICK_FILTERS: { key: QuickFilter; label: string; icon: typeof Ban; countFn: (tasks: EstablishmentTask[]) => number }[] = [
  {
    key: "overdue", label: "Försenade", icon: Clock,
    countFn: (tasks) => {
      const today = startOfDay(new Date());
      return tasks.filter(t => t.status !== "done" && t.end_date && isBefore(startOfDay(new Date(t.end_date)), today)).length;
    },
  },
  {
    key: "blocked", label: "Blockerade", icon: Ban,
    countFn: (tasks) => tasks.filter(t => t.status === "blocked").length,
  },
  {
    key: "today", label: "Idag", icon: CalendarDays,
    countFn: (tasks) => {
      const today = startOfDay(new Date());
      return tasks.filter(t => {
        if (t.status === "done") return false;
        const s = t.start_date ? startOfDay(new Date(t.start_date)) : null;
        const e = t.end_date ? endOfDay(new Date(t.end_date)) : null;
        if (!s || !e) return false;
        return isWithinInterval(today, { start: s, end: e }) || isTodayFn(s);
      }).length;
    },
  },
  {
    key: "this_week", label: "Denna vecka", icon: CalendarDays,
    countFn: (tasks) => {
      const today = startOfDay(new Date());
      const ws = startOfWeek(today, { weekStartsOn: 1 });
      const we = endOfWeek(today, { weekStartsOn: 1 });
      return tasks.filter(t => {
        if (t.status === "done") return false;
        const s = t.start_date ? startOfDay(new Date(t.start_date)) : null;
        const e = t.end_date ? endOfDay(new Date(t.end_date)) : null;
        if (!s || !e) return false;
        return s <= we && e >= ws;
      }).length;
    },
  },
  {
    key: "unassigned", label: "Utan ägare", icon: UserX,
    countFn: (tasks) => tasks.filter(t => {
      const ids = t.assigned_to_ids?.length ? t.assigned_to_ids : (t.assigned_to ? [t.assigned_to] : []);
      return ids.length === 0 && t.status !== "done" && t.status !== "cancelled";
    }).length,
  },
  {
    key: "needs_decision", label: "Beslut krävs", icon: HelpCircle,
    countFn: (tasks) => tasks.filter(t => t.decision_needed && t.status !== "done").length,
  },
  {
    key: "completed", label: "Klara", icon: CheckCircle2,
    countFn: (tasks) => tasks.filter(t => t.status === "done").length,
  },
];

// ── Component ─────────────────────────────────────────────────
interface PlanningFilterBarProps {
  tasks: EstablishmentTask[];
  filters: PlanningFilters;
  onFiltersChange: (filters: PlanningFilters) => void;
  staffPool: Array<{ id: string; name: string }>;
  filteredCount: number;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "Ej startad" },
  { value: "in_progress", label: "Pågår" },
  { value: "blocked", label: "Blockerad" },
  { value: "done", label: "Klar" },
  { value: "cancelled", label: "Avbruten" },
];

const READINESS_OPTIONS: { value: TaskReadiness; label: string }[] = [
  { value: "ready", label: "Redo" },
  { value: "missing_information", label: "Saknar info" },
  { value: "waiting_for_decision", label: "Väntar beslut" },
  { value: "waiting_for_external", label: "Väntar extern" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "Hög" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Låg" },
];

const PlanningFilterBar = ({ tasks, filters, onFiltersChange, staffPool, filteredCount }: PlanningFilterBarProps) => {
  const isActive = hasActiveFilters(filters);

  const setQuick = (key: QuickFilter) => {
    onFiltersChange({
      ...EMPTY_FILTERS,
      quickFilter: filters.quickFilter === key ? null : key,
    });
  };

  const setDropdown = <K extends keyof PlanningFilters>(key: K, value: PlanningFilters[K]) => {
    onFiltersChange({
      ...filters,
      quickFilter: null, // clear quick when using dropdowns
      [key]: value,
    });
  };

  const dateRange = filters.dateRange
    ? { from: filters.dateRange.from, to: filters.dateRange.to }
    : undefined;

  return (
    <div className="space-y-2">
      {/* Quick filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
        {QUICK_FILTERS.map(qf => {
          const count = qf.countFn(tasks);
          const active = filters.quickFilter === qf.key;
          const Icon = qf.icon;
          return (
            <button
              key={qf.key}
              onClick={() => setQuick(qf.key)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground",
                count === 0 && !active && "opacity-50"
              )}
            >
              <Icon className="h-3 w-3" />
              {qf.label}
              {count > 0 && (
                <span className={cn(
                  "ml-0.5 text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dropdown filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Assigned to */}
        <Select
          value={filters.assignedTo || "__all__"}
          onValueChange={(v) => setDropdown("assignedTo", v === "__all__" ? null : v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <User className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Alla personer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alla personer</SelectItem>
            
            {staffPool.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status || "__all__"}
          onValueChange={(v) => setDropdown("status", v === "__all__" ? null : v as TaskStatus)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alla statusar</SelectItem>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Readiness */}
        <Select
          value={filters.readiness || "__all__"}
          onValueChange={(v) => setDropdown("readiness", v === "__all__" ? null : v as TaskReadiness)}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Alla beredskap" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alla beredskap</SelectItem>
            {READINESS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority */}
        <Select
          value={filters.priority || "__all__"}
          onValueChange={(v) => setDropdown("priority", v === "__all__" ? null : v as TaskPriority)}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Alla prio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alla prio</SelectItem>
            {PRIORITY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarDays className="h-3 w-3" />
              {filters.dateRange
                ? `${new Date(filters.dateRange.from).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} – ${new Date(filters.dateRange.to).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`
                : "Datumintervall"
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range: DateRange | undefined) => {
                if (range?.from && range?.to) {
                  setDropdown("dateRange", { from: range.from, to: range.to });
                } else if (range?.from) {
                  setDropdown("dateRange", { from: range.from, to: range.from });
                } else {
                  setDropdown("dateRange", null);
                }
              }}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {/* Clear + count */}
        {isActive && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
            >
              <X className="h-3 w-3" />
              Rensa
            </Button>
            <Badge variant="secondary" className="text-xs h-5">
              {filteredCount} / {tasks.length} uppgifter
            </Badge>
          </>
        )}
      </div>
    </div>
  );
};

export default PlanningFilterBar;
