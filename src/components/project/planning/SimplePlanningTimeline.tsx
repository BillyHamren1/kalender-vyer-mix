import { useMemo } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, HardHat, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

interface TimelineProduct {
  id: string;
  name: string;
  quantity?: number | null;
}

interface SimplePlanningTimelineProps {
  tasks: EstablishmentTask[];
  staffPool: Array<{ id: string; name: string }>;
  products?: TimelineProduct[];
  onTaskClick: (task: EstablishmentTask) => void;
  onCreateMoment: () => void;
  onPlanFromBooking: () => void;
}

const SimplePlanningTimeline = ({ tasks, staffPool, products = [], onTaskClick, onCreateMoment, onPlanFromBooking }: SimplePlanningTimelineProps) => {
  const productMap = useMemo(() => {
    const map = new Map<string, TimelineProduct>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const taskProducts = (task: EstablishmentTask): TimelineProduct[] => {
    const ids = task.source_product_ids?.length
      ? task.source_product_ids
      : task.source_product_id
        ? [task.source_product_id]
        : [];
    return ids.map((id) => productMap.get(id)).filter(Boolean) as TimelineProduct[];
  };
  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const ad = `${a.start_date || "9999-12-31"}T${a.start_time || "23:59"}`;
    const bd = `${b.start_date || "9999-12-31"}T${b.start_time || "23:59"}`;
    return ad.localeCompare(bd) || a.sort_order - b.sort_order;
  }), [tasks]);

  const groups = useMemo(() => {
    const map = new Map<string, EstablishmentTask[]>();
    sorted.forEach((task) => {
      const key = task.start_date || "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    });
    return Array.from(map.entries());
  }, [sorted]);

  const staffName = (task: EstablishmentTask) => {
    const id = task.assigned_to_ids?.[0] || task.assigned_to;
    return id ? staffPool.find((p) => p.id === id)?.name || null : null;
  };

  if (tasks.length === 0) {
    return (
      <Card className="border-border/60 shadow-sm">
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <HardHat className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold">Ingen genomförandeplan ännu</h3>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Lägg upp etableringen i den ordning arbetet ska ske. Du kan skapa fria moment eller börja från det som faktiskt finns i bokningen.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={onCreateMoment}>+ Nytt moment</Button>
            <Button variant="outline" onClick={onPlanFromBooking}>Planera från bokningen</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([dateKey, dayTasks]) => {
        const date = dateKey === "unscheduled" ? null : parseISO(dateKey);
        const isToday = date ? isSameDay(date, new Date()) : false;
        return (
          <section key={dateKey} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold capitalize">
                {date ? format(date, "EEEE d MMMM", { locale: sv }) : "Ej tidsatt"}
              </h3>
              {isToday && <Badge className="h-5 px-1.5 text-[10px]">Idag</Badge>}
              <span className="text-xs text-muted-foreground">{dayTasks.length} moment</span>
            </div>

            <Card className="overflow-hidden border-border/60 shadow-sm">
              <div className="divide-y divide-border/60">
                {dayTasks.map((task) => {
                  const person = staffName(task);
                  const isCalendar = task.source === "calendar_manual" || task.category?.toLowerCase() === "kalender";
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick(task)}
                      className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/35"
                    >
                      <div className="w-[106px] shrink-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                          {task.start_time?.slice(0, 5) || "—"}
                        </div>
                        <div className="mt-0.5 pl-5 text-xs text-muted-foreground tabular-nums">
                          {task.end_time?.slice(0, 5) || ""}
                        </div>
                      </div>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                        {isCalendar ? <CalendarDays className="h-4 w-4 text-primary" /> : <HardHat className="h-4 w-4 text-primary" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={task.status === "done" ? "font-medium line-through text-muted-foreground" : "font-medium"}>{task.title}</span>
                          {task.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {task.source === "product" && <Badge variant="outline" className="text-[10px]">Från bokning</Badge>}
                          {isCalendar && <Badge variant="secondary" className="text-[10px]">Kalender</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {!isCalendar && task.category && <span>{task.category}</span>}
                          {person && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{person}</span>}
                          {task.description && <span className="truncate max-w-[420px]">{task.description}</span>}
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            </Card>
          </section>
        );
      })}
    </div>
  );
};

export default SimplePlanningTimeline;
