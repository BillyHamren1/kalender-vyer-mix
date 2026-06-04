import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ListChecks,
  Plus,
  Calendar as CalendarIcon,
  MapPin,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';
import { useMyTodos, MyTodoRow } from '@/hooks/useMyTodos';
import CreateTodoWizard from '@/components/todo/CreateTodoWizard';

type Filter = 'all' | 'today' | 'upcoming' | 'overdue' | 'done';

const todayIso = () => new Date().toISOString().slice(0, 10);

const isOverdue = (t: MyTodoRow) =>
  t.planning_status !== 'done' &&
  t.planning_status !== 'completed' &&
  !!t.scheduled_date &&
  t.scheduled_date < todayIso();

const isDone = (t: MyTodoRow) =>
  t.planning_status === 'done' || t.planning_status === 'completed';

const MyPageTodos: React.FC = () => {
  const navigate = useNavigate();
  const { staffId, isLoading: staffLoading } = useCurrentStaffId();
  const { data: todos = [], isLoading, markDone, reopen, remove } = useMyTodos(staffId);

  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const today = todayIso();
    return {
      all: todos.length,
      today: todos.filter((t) => t.scheduled_date === today && !isDone(t)).length,
      upcoming: todos.filter((t) => !!t.scheduled_date && t.scheduled_date > today && !isDone(t)).length,
      overdue: todos.filter((t) => isOverdue(t)).length,
      done: todos.filter((t) => isDone(t)).length,
    };
  }, [todos]);

  const filtered = useMemo(() => {
    const today = todayIso();
    let list = todos;
    if (filter === 'today') list = todos.filter((t) => t.scheduled_date === today && !isDone(t));
    else if (filter === 'upcoming')
      list = todos.filter((t) => !!t.scheduled_date && t.scheduled_date > today && !isDone(t));
    else if (filter === 'overdue') list = todos.filter((t) => isOverdue(t));
    else if (filter === 'done') list = todos.filter((t) => isDone(t));
    return [...list].sort((a, b) => {
      const ad = a.scheduled_date || '9999-12-31';
      const bd = b.scheduled_date || '9999-12-31';
      if (ad !== bd) return ad.localeCompare(bd);
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
  }, [todos, filter]);

  const filters: { key: Filter; label: string; count: number; tone?: string }[] = [
    { key: 'all', label: 'Alla', count: counts.all },
    { key: 'today', label: 'Idag', count: counts.today },
    { key: 'upcoming', label: 'Kommande', count: counts.upcoming },
    { key: 'overdue', label: 'Försenade', count: counts.overdue, tone: 'destructive' },
    { key: 'done', label: 'Klara', count: counts.done },
  ];

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={ListChecks}
        title="Mina todos"
        variant="purple"
        subtitle="Dina personliga uppgifter"
        actions={
          <Button size="sm" onClick={() => { setEditId(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Ny todo
          </Button>
        }
      />

      {/* Filter-rad */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              filter === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                filter === f.key
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : f.tone === 'destructive' && f.count > 0
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {staffLoading || isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">Laddar…</CardContent>
        </Card>
      ) : !staffId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ingen personalprofil kopplad till ditt konto.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListChecks className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">
              {filter === 'all' ? 'Du har inga personliga todos ännu.' : 'Inga todos i denna vy.'}
            </p>
            {filter === 'all' && (
              <Button onClick={() => { setEditId(null); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Skapa din första todo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              onEdit={() => { setEditId(t.id); setCreateOpen(true); }}
              onDone={() => markDone.mutate(t.id)}
              onReopen={() => reopen.mutate(t.id)}
              onDelete={() => {
                if (confirm('Ta bort denna todo?')) remove.mutate(t.id);
              }}
              onOpenProject={() => {
                if (t.large_project_id) navigate(`/large-project/${t.large_project_id}`);
              }}
            />
          ))}
        </div>
      )}

      <CreateTodoWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => setCreateOpen(false)}
        todoId={editId}
        personalCalendarMode
        currentStaffId={staffId}
      />
    </PageContainer>
  );
};

const TodoCard: React.FC<{
  todo: MyTodoRow;
  onEdit: () => void;
  onDone: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onOpenProject: () => void;
}> = ({ todo, onEdit, onDone, onReopen, onDelete, onOpenProject }) => {
  const done = isDone(todo);
  const overdue = isOverdue(todo);

  const dateLabel = todo.scheduled_date
    ? format(parseISO(todo.scheduled_date), 'EEE d MMM', { locale: sv })
    : 'Inget datum';
  const timeLabel =
    todo.start_time
      ? `${todo.start_time.slice(0, 5)}${todo.end_time ? `–${todo.end_time.slice(0, 5)}` : ''}`
      : null;

  return (
    <Card
      className={cn(
        'group border-l-[3px] transition-shadow hover:shadow-md',
        done
          ? 'border-l-emerald-500/60 bg-muted/30 opacity-80'
          : overdue
            ? 'border-l-destructive/70'
            : 'border-l-primary/50'
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {todo.type_label && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {todo.type_label}
                </Badge>
              )}
              {overdue && !done && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertCircle className="h-3 w-3" /> Försenad
                </Badge>
              )}
              {done && (
                <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3" /> Klar
                </Badge>
              )}
            </div>
            <h3
              className={cn(
                'font-semibold text-sm leading-snug break-words',
                done && 'line-through text-muted-foreground'
              )}
            >
              {todo.title}
            </h3>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Redigera
              </DropdownMenuItem>
              {done ? (
                <DropdownMenuItem onClick={onReopen}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Återöppna
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onDone}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Markera klar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Ta bort
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateLabel}
          </span>
          {timeLabel && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {timeLabel}
            </span>
          )}
          {(todo.booking_id || todo.large_project_id) && (
            <button
              type="button"
              onClick={onOpenProject}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5" />
              {todo.client || (todo.booking_id ? `Bokning ${todo.booking_id}` : 'Projekt')}
            </button>
          )}
          {todo.address && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {todo.address}
              {todo.city ? `, ${todo.city}` : ''}
            </span>
          )}
        </div>

        {!done && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDone}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Klar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Ändra
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MyPageTodos;
