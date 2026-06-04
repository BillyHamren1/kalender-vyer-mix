import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, addMonths, format, startOfMonth, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Briefcase,
  CheckSquare,
  Flag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';
import { useMyCalendarItems, MyCalendarItem } from '@/hooks/useMyCalendarItems';
import { MyCalendarMonthView } from './MyCalendarMonthView';
import { MyCalendarWeekView } from './MyCalendarWeekView';
import { MyCalendarListView } from './MyCalendarListView';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Mode = 'month' | 'week' | 'list';

const todayIso = () => new Date().toISOString().slice(0, 10);

export const MyCalendarShell: React.FC = () => {
  const navigate = useNavigate();
  const { staffId, isLoading: staffLoading } = useCurrentStaffId();
  const { data, isLoading } = useMyCalendarItems(staffId);

  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [openTodo, setOpenTodo] = useState<MyCalendarItem | null>(null);

  const items = data?.items ?? [];
  const projects = data?.projects ?? [];

  const stats = useMemo(() => {
    const today = todayIso();
    const activeProjects = projects.length;
    const openTodos = items.filter((i) => i.kind === 'todo' && i.status !== 'done').length;
    const overdue = items.filter((i) => i.overdue).length;
    const nextItem = items.find((i) => i.date >= today);
    return { activeProjects, openTodos, overdue, nextItem };
  }, [items, projects]);

  const headerLabel = useMemo(() => {
    if (mode === 'month') return format(anchor, 'MMMM yyyy', { locale: sv });
    if (mode === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = addDays(s, 6);
      return `${format(s, 'd MMM', { locale: sv })} – ${format(e, 'd MMM yyyy', { locale: sv })}`;
    }
    return 'Kommande';
  }, [anchor, mode]);

  const handleStep = (dir: -1 | 1) => {
    if (mode === 'month') setAnchor((d) => addMonths(d, dir));
    else if (mode === 'week') setAnchor((d) => addDays(d, dir * 7));
  };

  const handleItemClick = (item: MyCalendarItem) => {
    if (item.kind === 'todo') {
      setOpenTodo(item);
      return;
    }
    if (item.projectId && item.projectType) {
      navigate(item.projectType === 'large' ? `/large-project/${item.projectId}` : `/project/${item.projectId}`);
    }
  };

  const goToTodoProject = (todo: MyCalendarItem) => {
    setOpenTodo(null);
    if (todo.largeProjectId) {
      navigate(`/large-project/${todo.largeProjectId}`);
    } else if (todo.bookingId) {
      // booking_id på todos är text — försök matcha mot mina projekt
      const match = projects.find((p) => p.type === 'standard' && p.bookingNumber === todo.bookingId);
      if (match) navigate(`/project/${match.id}`);
    }
  };

  const filteredForView = useMemo(() => {
    if (mode === 'list') {
      const today = todayIso();
      return items.filter((i) => i.date >= today).slice(0, 200);
    }
    return items;
  }, [items, mode]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Briefcase} label="Aktiva projekt" value={stats.activeProjects} />
        <StatCard icon={CheckSquare} label="Öppna todos" value={stats.openTodos} tone="blue" />
        <StatCard icon={AlertCircle} label="Försenade" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'muted'} />
        <StatCard
          icon={Flag}
          label="Nästa"
          value={stats.nextItem ? format(new Date(stats.nextItem.date), 'd MMM', { locale: sv }) : '—'}
          sub={stats.nextItem?.title}
          tone="amber"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex items-center rounded-lg border border-border/60 bg-card p-0.5">
          {(['month', 'week', 'list'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'month' ? 'Månad' : m === 'week' ? 'Vecka' : 'Lista'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {mode !== 'list' && (
            <>
              <Button variant="ghost" size="icon" onClick={() => handleStep(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[160px] text-center text-sm font-semibold capitalize">{headerLabel}</div>
              <Button variant="ghost" size="icon" onClick={() => handleStep(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
                Idag
              </Button>
            </>
          )}
          {mode === 'list' && <div className="text-sm font-semibold">{headerLabel}</div>}
        </div>
      </div>

      {/* View */}
      {(staffLoading || isLoading) ? (
        <Card>
          <CardContent className="py-16 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Laddar din kalender…
          </CardContent>
        </Card>
      ) : !staffId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ingen personalprofil kopplad till ditt konto.
          </CardContent>
        </Card>
      ) : mode === 'month' ? (
        <MyCalendarMonthView anchorDate={anchor} items={filteredForView} onItemClick={handleItemClick} />
      ) : mode === 'week' ? (
        <MyCalendarWeekView anchorDate={anchor} items={filteredForView} onItemClick={handleItemClick} />
      ) : (
        <MyCalendarListView items={filteredForView} onItemClick={handleItemClick} />
      )}

      {/* Todo dialog */}
      <Dialog open={!!openTodo} onOpenChange={(o) => !o && setOpenTodo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openTodo?.title}</DialogTitle>
            <DialogDescription>
              {openTodo && format(new Date(openTodo.date), 'EEEE d MMMM yyyy', { locale: sv })}
              {openTodo?.startTime && ` · ${openTodo.startTime}${openTodo.endTime ? `–${openTodo.endTime}` : ''}`}
            </DialogDescription>
          </DialogHeader>
          {openTodo?.subtitle && (
            <div className="text-sm text-muted-foreground">{openTodo.subtitle}</div>
          )}
          {openTodo?.overdue && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> Försenad
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenTodo(null)}>
              Stäng
            </Button>
            {openTodo && (openTodo.largeProjectId || openTodo.bookingId) && (
              <Button onClick={() => openTodo && goToTodoProject(openTodo)}>Öppna projekt</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard: React.FC<{
  icon: typeof Briefcase;
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'primary' | 'blue' | 'red' | 'amber' | 'muted';
}> = ({ icon: Icon, label, value, sub, tone = 'primary' }) => {
  const toneCls = {
    primary: 'border-l-primary text-primary',
    blue: 'border-l-blue-500 text-blue-600',
    red: 'border-l-destructive text-destructive',
    amber: 'border-l-amber-500 text-amber-600',
    muted: 'border-l-muted-foreground text-muted-foreground',
  }[tone];
  return (
    <Card className={cn('border-l-[3px]', toneCls)}>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <div className="text-xl font-bold leading-tight truncate">{value}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
          {sub && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
};

export default MyCalendarShell;
