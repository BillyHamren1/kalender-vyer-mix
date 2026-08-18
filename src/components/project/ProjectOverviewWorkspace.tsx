import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  HardHat,
  MapPin,
  Plus,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectTask } from "@/types/project";
import type { ProjectWithBooking } from "@/types/project";

interface ProjectOverviewWorkspaceProps {
  project: ProjectWithBooking;
  tasks: ProjectTask[];
  bookingId: string | null;
  onAddTask: (task: { title: string; description?: string; deadline?: string | null }) => void;
  onUpdateTask: (args: { id: string; updates: Partial<ProjectTask> }) => void;
}

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM", { locale: sv });
  } catch {
    return value.slice(0, 10);
  }
};

const ProjectOverviewWorkspace = ({ project, tasks, onAddTask, onUpdateTask }: ProjectOverviewWorkspaceProps) => {
  const navigate = useNavigate();
  const quickInput = useRef<HTMLInputElement>(null);
  const [todoTitle, setTodoTitle] = useState("");

  const booking = project.booking;
  const rigDate = project.rigdaydate || booking?.rigdaydate || null;
  const eventDate = project.eventdate || booking?.eventdate || null;
  const rigDownDate = project.rigdowndate || booking?.rigdowndate || null;
  const address = project.deliveryaddress || booking?.deliveryaddress || "Ingen adress angiven";

  const openTasks = useMemo(
    () => tasks.filter((task) => !task.completed && !task.is_info_only),
    [tasks],
  );
  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed && !task.is_info_only).length,
    [tasks],
  );

  const addTodo = () => {
    const title = todoTitle.trim();
    if (!title) return;
    onAddTask({ title });
    setTodoTitle("");
    requestAnimationFrame(() => quickInput.current?.focus());
  };


  return (
    <div className="space-y-4">
      {/* Actual project overview: only facts the PM needs at a glance. */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/50 md:grid-cols-4 md:divide-y-0">
          <OverviewFact icon={HardHat} label="Etablering" value={dateLabel(rigDate)} />
          <OverviewFact icon={CalendarDays} label="Event" value={dateLabel(eventDate)} />
          <OverviewFact icon={HardHat} label="Nedrigg" value={dateLabel(rigDownDate)} />
          <OverviewFact icon={MapPin} label="Plats" value={address} compact />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {/* TODOS */}
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Att göra</h2>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{openTasks.length}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Projektets enkla todo-lista.</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("execution")}>
              <HardHat className="h-3.5 w-3.5" /> Planering
            </Button>
          </div>

          <div className="flex items-center gap-2 border-b border-border/40 bg-muted/15 p-3">
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={quickInput}
              value={todoTitle}
              onChange={(event) => setTodoTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addTodo()}
              placeholder="Skriv en uppgift och tryck Enter…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {todoTitle.trim() && (
              <Button size="sm" className="h-8" onClick={addTodo}>Lägg till</Button>
            )}
          </div>

          <div className="max-h-[430px] overflow-y-auto">
            {openTasks.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Check className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                <p className="text-sm font-medium">Inget öppet just nu</p>
                <p className="mt-1 text-xs text-muted-foreground">Lägg till nästa sak som behöver göras ovan.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {openTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      aria-label={`Markera ${task.title} som klar`}
                      onClick={() => onUpdateTask({ id: task.id, updates: { completed: true } })}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <Check className="h-3 w-3 opacity-0 hover:opacity-100" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      {(task.deadline || task.assigned_to) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {task.deadline && <span>{dateLabel(task.deadline)}</span>}
                          {task.assigned_to && <span>{task.assigned_to}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {completedCount > 0 && (
            <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
              {completedCount} klara uppgifter
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const OverviewFact = ({ icon: Icon, label, value, compact }: { icon: React.ElementType; label: string; value: string; compact?: boolean }) => (
  <div className="min-w-0 p-4">
    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <p className={cn("font-semibold", compact ? "truncate text-sm" : "text-base")}>{value}</p>
  </div>
);

export default ProjectOverviewWorkspace;
