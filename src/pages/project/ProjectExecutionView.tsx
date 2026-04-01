import { useState, useMemo, useEffect, useRef } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isBefore, startOfDay, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Filter,
  User,
  UserCog,
  CalendarIcon,
  Play,
  Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { useProjectDetail } from "@/hooks/useProjectDetail";
import type { EstablishmentTask, TaskType, TaskStatus } from "@/services/establishmentTaskService";
import { updateEstablishmentTask } from "@/services/establishmentTaskService";

// ── constants ──────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  crew: "Fält",
  pm: "PL",
  logistics: "Logistik",
  admin: "Admin",
};

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  crew: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pm: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  logistics: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  admin: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Att göra",
  in_progress: "Pågår",
  blocked: "Blockerad",
  done: "Klar",
};

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Play,
  blocked: Ban,
  done: CheckCircle2,
};

// ── helpers ────────────────────────────────────────────────────────────

function getDateGroup(task: EstablishmentTask): "overdue" | "today" | "upcoming" | "done" | "no_date" {
  if (task.status === "done") return "done";
  const ref = task.due_date ?? task.end_date;
  if (!ref) return "no_date";
  const d = startOfDay(parseISO(ref));
  const now = startOfDay(new Date());
  if (isBefore(d, now)) return "overdue";
  if (isToday(d)) return "today";
  return "upcoming";
}

function getIndicatorColor(group: string, status: TaskStatus) {
  if (status === "done") return "border-l-green-500";
  if (status === "blocked") return "border-l-destructive";
  if (group === "overdue") return "border-l-red-500";
  if (group === "today") return "border-l-yellow-500";
  return "border-l-border";
}

// ── component ──────────────────────────────────────────────────────────

const ProjectExecutionView = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;
  const location = useLocation();
  const bookingId = project?.booking_id || project?.booking?.id || null;
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Pick up task highlight from navigation state (e.g. from calendar)
  useEffect(() => {
    const tid = (location.state as any)?.highlightTaskId;
    if (tid) {
      setHighlightedTaskId(tid);
      window.history.replaceState({}, document.title);
      // Clear highlight after a few seconds
      const timer = setTimeout(() => setHighlightedTaskId(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // Scroll highlighted task into view once rendered
  useEffect(() => {
    if (highlightedTaskId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [highlightedTaskId]);

  // Filters
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Fetch establishment tasks for this booking
  const { data: tasks = [], refetch } = useQuery({
    queryKey: ["execution-tasks", bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("establishment_tasks")
        .select(
          "id, title, category, start_date, end_date, status, priority, assigned_to, assigned_to_ids, task_type, assigned_user_id, due_date, completed, notes"
        )
        .eq("booking_id", bookingId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as EstablishmentTask[];
    },
    enabled: !!bookingId,
  });

  // Fetch staff names
  const staffIds = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => {
      (t.assigned_to_ids || []).forEach((id) => ids.add(id));
      if (t.assigned_to) ids.add(t.assigned_to);
    });
    return Array.from(ids);
  }, [tasks]);

  // Fetch user IDs (system users / PL)
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => {
      if (t.assigned_user_id) ids.add(t.assigned_user_id);
    });
    return Array.from(ids);
  }, [tasks]);

  const { data: staffMap = {} } = useQuery({
    queryKey: ["staff-names", staffIds.join(",")],
    queryFn: async () => {
      if (staffIds.length === 0) return {};
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .in("id", staffIds);
      const map: Record<string, string> = {};
      (data || []).forEach((s) => (map[s.id] = s.name));
      return map;
    },
    enabled: staffIds.length > 0,
  });

  const { data: userMap = {} } = useQuery({
    queryKey: ["user-names", userIds.join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((u) => (map[u.user_id] = u.full_name || u.email || "Okänd"));
      return map;
    },
    enabled: userIds.length > 0,
  });

  // Apply filters
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterType !== "all" && t.task_type !== filterType) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPerson !== "all") {
        const ids = t.assigned_to_ids || [];
        if (!ids.includes(filterPerson) && t.assigned_to !== filterPerson && t.assigned_user_id !== filterPerson) return false;
      }
      return true;
    });
  }, [tasks, filterPerson, filterType, filterStatus]);

  // Group by date bucket
  const groups = useMemo(() => {
    const buckets: Record<string, EstablishmentTask[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      done: [],
      no_date: [],
    };
    filtered.forEach((t) => {
      buckets[getDateGroup(t)].push(t);
    });
    return buckets;
  }, [filtered]);

  // Quick actions
  const handleMarkDone = async (task: EstablishmentTask) => {
    try {
      await updateEstablishmentTask(task.id, {
        status: task.status === "done" ? "todo" : "done",
        completed: task.status !== "done",
      });
      refetch();
      toast.success(task.status === "done" ? "Återöppnad" : "Markerad som klar");
    } catch {
      toast.error("Kunde inte uppdatera");
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateEstablishmentTask(taskId, {
        status: newStatus,
        completed: newStatus === "done",
      });
      refetch();
      toast.success(`Status ändrad till ${STATUS_LABELS[newStatus]}`);
    } catch {
      toast.error("Kunde inte uppdatera");
    }
  };

  const handleChangeDate = async (taskId: string, date: Date) => {
    try {
      await updateEstablishmentTask(taskId, {
        due_date: format(date, "yyyy-MM-dd"),
      } as any);
      refetch();
      toast.success("Deadline uppdaterad");
    } catch {
      toast.error("Kunde inte uppdatera");
    }
  };

  const handleReassign = async (taskId: string, staffId: string) => {
    try {
      await updateEstablishmentTask(taskId, {
        assigned_to: staffId,
        assigned_to_ids: [staffId],
      });
      refetch();
      const name = staffMap[staffId] || userMap[staffId] || "person";
      toast.success(`Tilldelad till ${name}`);
    } catch {
      toast.error("Kunde inte tilldela");
    }
  };

  if (!project) return null;

  const allAssignees = [
    ...staffIds.map(id => ({ id, name: staffMap[id] || id.slice(0, 8), type: "staff" as const })),
    ...userIds.map(id => ({ id, name: userMap[id] || id.slice(0, 8), type: "user" as const })),
  ];

  const groupOrder: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "overdue", label: "Försenade", icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
    { key: "today", label: "Idag", icon: <Clock className="h-4 w-4 text-yellow-500" /> },
    { key: "upcoming", label: "Kommande", icon: <CalendarIcon className="h-4 w-4 text-muted-foreground" /> },
    { key: "no_date", label: "Utan datum", icon: <Circle className="h-4 w-4 text-muted-foreground" /> },
    { key: "done", label: "Klara", icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filter
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla typer</SelectItem>
            <SelectItem value="crew">Fält</SelectItem>
            <SelectItem value="pm">Projektledning</SelectItem>
            <SelectItem value="logistics">Logistik</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla status</SelectItem>
            <SelectItem value="todo">Att göra</SelectItem>
            <SelectItem value="in_progress">Pågår</SelectItem>
            <SelectItem value="blocked">Blockerad</SelectItem>
            <SelectItem value="done">Klar</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPerson} onValueChange={setFilterPerson}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Person" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla personer</SelectItem>
            {staffIds.map((id) => (
              <SelectItem key={id} value={id}>
                {staffMap[id] || id.slice(0, 8)}
              </SelectItem>
            ))}
            {userIds.map((id) => (
              <SelectItem key={`u-${id}`} value={id}>
                {userMap[id] || id.slice(0, 8)} (kontor)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} av {tasks.length} aktiviteter
        </div>
      </div>

      {/* Task groups */}
      {groupOrder.map(({ key, label, icon }) => {
        const items = groups[key] || [];
        if (items.length === 0) return null;

        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-3">
              {icon}
              <h3 className="text-sm font-semibold text-foreground">{label}</h3>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>

            <div className="space-y-2">
              {items.map((task) => {
                const group = getDateGroup(task);
                const assignedNames = (task.assigned_to_ids || [])
                  .map((id) => staffMap[id])
                  .filter(Boolean);
                const assignedUserName = task.assigned_user_id ? userMap[task.assigned_user_id] : null;
                const StatusIcon = STATUS_ICONS[task.status as TaskStatus] || Circle;

                return (
                  <div
                    key={task.id}
                    ref={task.id === highlightedTaskId ? highlightRef : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-card p-3 border-l-4 transition-all hover:bg-accent/30",
                      getIndicatorColor(group, task.status as TaskStatus),
                      task.id === highlightedTaskId && "ring-2 ring-primary ring-offset-2 bg-primary/5"
                    )}
                  >
                    {/* Done toggle */}
                    <button
                      onClick={() => handleMarkDone(task)}
                      className="flex-shrink-0"
                    >
                      {task.status === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-sm font-medium truncate",
                            task.status === "done" && "line-through text-muted-foreground"
                          )}
                        >
                          {task.title}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0", TASK_TYPE_COLORS[task.task_type as TaskType] || TASK_TYPE_COLORS.crew)}
                        >
                          {TASK_TYPE_LABELS[task.task_type as TaskType] || "Fält"}
                        </Badge>
                        {task.priority === "high" && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Hög
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {assignedNames.length > 0 && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {assignedNames.join(", ")}
                          </span>
                        )}
                        {assignedUserName && (
                          <span className="flex items-center gap-1">
                            <UserCog className="h-3 w-3" />
                            {assignedUserName}
                          </span>
                        )}
                        {(task.due_date || task.end_date) && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {format(parseISO(task.due_date || task.end_date), "d MMM", { locale: sv })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {STATUS_LABELS[task.status as TaskStatus] || task.status}
                        </span>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Status change */}
                      <Select
                        value={task.status}
                        onValueChange={(v) => handleStatusChange(task.id, v as TaskStatus)}
                      >
                        <SelectTrigger className="h-7 w-[90px] text-[10px] border-dashed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">Att göra</SelectItem>
                          <SelectItem value="in_progress">Pågår</SelectItem>
                          <SelectItem value="blocked">Blockerad</SelectItem>
                          <SelectItem value="done">Klar</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Reassign */}
                      {allAssignees.length > 0 && (
                        <Select onValueChange={(v) => handleReassign(task.id, v)}>
                          <SelectTrigger className="h-7 w-[90px] text-[10px] border-dashed">
                            <SelectValue placeholder="Tilldela" />
                          </SelectTrigger>
                          <SelectContent>
                            {allAssignees.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-xs">
                                {a.name}{a.type === "user" ? " (PL)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Quick date change */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="single"
                            selected={task.due_date ? parseISO(task.due_date) : undefined}
                            onSelect={(d) => d && handleChangeDate(task.id, d)}
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Inga aktiviteter matchar filtret</p>
        </div>
      )}
    </div>
  );
};

export default ProjectExecutionView;
