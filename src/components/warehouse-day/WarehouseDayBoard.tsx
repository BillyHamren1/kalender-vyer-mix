import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Inbox, Package, Plus, RotateCcw, UserRound, Wrench, ClipboardList, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OpsJob, OpsRangeData } from '@/hooks/useWarehouseOpsRange';
import { useWarehouseDayStaff } from '@/hooks/useWarehouseDayStaff';
import { useWarehouseDayTodos, useWarehouseTodoActions, type WarehouseTodo } from '@/hooks/useWarehouseDayTodos';
import { buildDayLanes, type WarehouseLane } from '@/lib/warehouse/warehouseDayBoard';
import { assignStaffToPacking, removeStaffFromPacking } from '@/services/warehouseAssignmentsSync';
import QuickWarehouseTodoDialog from './QuickWarehouseTodoDialog';

const LANES: { key: WarehouseLane; title: string; icon: typeof Package; kind?: 'warehouse_task' | 'repair_care' }[] = [
  { key: 'packing', title: 'Dagens packningar', icon: Package },
  { key: 'returns', title: 'Dagens returer', icon: RotateCcw },
  { key: 'repairs', title: 'Reparationer & vård', icon: Wrench, kind: 'repair_care' },
  { key: 'internal', title: 'Interna uppgifter & to-dos', icon: ClipboardList, kind: 'warehouse_task' },
];

interface Props { data: OpsRangeData; day: string; onOpenJob: (job: OpsJob) => void }

/**
 * Lagrets dagstavla: välj person till vänster, klicka sedan jobb/uppgift för att tilldela.
 * Klick på ett jobb utan vald person öppnar jobbet.
 */
export default function WarehouseDayBoard({ data, day, onOpenJob }: Props) {
  const qc = useQueryClient();
  const { data: staff = [] } = useWarehouseDayStaff(day);
  const { data: todos = [] } = useWarehouseDayTodos(day);
  const actions = useWarehouseTodoActions(day);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [createKind, setCreateKind] = useState<'warehouse_task' | 'repair_care' | null>(null);

  const lanes = useMemo(() => buildDayLanes(data.jobs, todos, day), [data.jobs, todos, day]);
  const nameOf = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of data.jobs) for (const a of j.assignedStaff) if (a.assignmentDate === day) m.set(a.staffId, (m.get(a.staffId) || 0) + 1);
    for (const t of todos) if (t.assignedStaffId && t.planningStatus !== 'completed') m.set(t.assignedStaffId, (m.get(t.assignedStaffId) || 0) + 1);
    return m;
  }, [data.jobs, todos, day]);
  const visibleStaff = showAll ? staff : staff.filter((s) => s.inWarehouseToday || s.id === selected);
  const selectedName = selected ? nameOf.get(selected) : null;

  const toggleJob = async (job: OpsJob) => {
    if (!selected) return onOpenJob(job);
    setBusy(job.id);
    const already = job.assignedStaff.some((a) => a.staffId === selected && a.assignmentDate === day);
    const res = already
      ? await removeStaffFromPacking({ staffId: selected, packingId: job.packingId })
      : await assignStaffToPacking({ staffId: selected, packingId: job.packingId, assignmentDate: day, forceReturn: job.direction === 'in' });
    setBusy(null);
    if (!res.ok) return toast.error('Kunde inte ändra bemanningen');
    toast.success(already ? `${selectedName} borttagen` : `${selectedName} tilldelad`);
    qc.invalidateQueries({ queryKey: ['warehouse-ops-range'] });
  };

  const toggleTodo = async (t: WarehouseTodo) => {
    if (!selected) return;
    setBusy(t.id);
    try {
      await actions.assign(t.id, t.assignedStaffId === selected ? null : selected);
    } catch { toast.error('Kunde inte tilldela uppgiften'); }
    setBusy(null);
  };

  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-2">
      <aside className="operations-resource-zone min-h-0 rounded-lg border flex flex-col">
        <div className="px-3 py-2 border-b border-border/55 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-warehouse" />
          <span className="text-xs font-bold">Personal idag</span>
          <button type="button" className="ml-auto text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Bara idag' : 'Visa alla'}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1">
          {visibleStaff.length === 0 && (
            <div className="p-2 text-[11px] text-muted-foreground">Ingen är schemalagd i lagret idag. Välj "Visa alla".</div>
          )}
          {visibleStaff.map((s) => (
            <button key={s.id} type="button" onClick={() => setSelected(selected === s.id ? null : s.id)}
              className={cn('w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                selected === s.id ? 'border-warehouse bg-warehouse/10 text-warehouse font-semibold' : 'border-transparent hover:bg-accent')}>
              <span className={cn('h-2 w-2 rounded-full shrink-0', s.inWarehouseToday ? 'bg-warehouse' : 'bg-muted-foreground/30')} />
              <span className="truncate">{s.name}</span>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{load.get(s.id) || 0}</span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border/55 text-[10px] text-muted-foreground">
          {selectedName ? <>Klicka jobb för att tilldela <b className="text-foreground">{selectedName}</b></> : 'Välj en person, klicka sedan jobb'}
        </div>
      </aside>

      <div className="min-h-0 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-2 overflow-y-auto">
        {LANES.map(({ key, title, icon: Icon, kind }) => {
          const lane = lanes[key];
          const count = lane.jobs.length + lane.todos.length;
          return (
            <section key={key} className="operations-lane min-h-[220px] rounded-lg border flex flex-col">
              <header className="px-3 py-2 border-b border-border/55 flex items-center gap-2">
                <Icon className="h-4 w-4 text-warehouse" />
                <span className="text-xs font-bold">{title}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                {kind && (
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" title="Ny uppgift" onClick={() => setCreateKind(kind)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1">
                {count === 0 && <div className="p-2 text-[11px] text-muted-foreground">Inget för idag.</div>}
                {lane.jobs.map((job) => {
                  const people = job.assignedStaff.filter((a) => a.assignmentDate === day);
                  const mine = !!selected && people.some((a) => a.staffId === selected);
                  return (
                    <button key={job.id} type="button" disabled={busy === job.id} onClick={() => toggleJob(job)}
                      className={cn('operations-work-card w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                        mine ? 'border-warehouse bg-warehouse/10' : 'border-border/60 hover:border-warehouse/60',
                        busy === job.id && 'opacity-50')}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate">{job.bookingNumber || job.name}</span>
                        {job.anchorTime && <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{job.anchorTime.slice(0, 5)}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{job.client || job.name}</div>
                      <div className={cn('mt-0.5 text-[11px] truncate', people.length ? 'text-foreground' : 'operations-unassigned font-semibold')}>
                        {people.length ? people.map((p) => p.name).join(', ') : 'Obemannad'}
                      </div>
                    </button>
                  );
                })}
                {lane.todos.map((t) => {
                  const done = t.planningStatus === 'completed';
                  const mine = !!selected && t.assignedStaffId === selected;
                  return (
                    <div key={t.id} role="button" tabIndex={0} onClick={() => toggleTodo(t)}
                      className={cn('operations-work-card w-full rounded-md border px-2 py-1.5 text-xs flex items-start gap-1.5',
                        mine ? 'border-warehouse bg-warehouse/10' : 'border-border/60', selected && 'cursor-pointer hover:border-warehouse/60',
                        busy === t.id && 'opacity-50')}>
                      <button type="button" title={done ? 'Ångra klar' : 'Markera klar'}
                        onClick={(e) => { e.stopPropagation(); actions.complete(t.id, !done).catch(() => toast.error('Kunde inte uppdatera')); }}
                        className={cn('mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center', done ? 'bg-warehouse border-warehouse text-primary-foreground' : 'border-border')}>
                        {done && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cn('font-semibold truncate', done && 'line-through text-muted-foreground')}>{t.title}</div>
                        <div className="flex items-center gap-1 text-[10px]">
                          {t.assignedStaffId
                            ? <span>{nameOf.get(t.assignedStaffId) || 'Tilldelad'}</span>
                            : <span className="operations-unassigned font-semibold">Obemannad</span>}
                          {!t.scheduledDate && <span className="text-muted-foreground">· i kön</span>}
                          {t.externalSource && <span className="ml-auto inline-flex items-center gap-0.5 text-muted-foreground"><Inbox className="h-3 w-3" />{t.externalSource}</span>}
                        </div>
                      </div>
                      {mine && <X className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <QuickWarehouseTodoDialog open={!!createKind} onOpenChange={(o) => !o && setCreateKind(null)}
        defaultKind={createKind || 'warehouse_task'} defaultStaffId={selected} staff={staff} onCreate={actions.create} />
    </div>
  );
}
