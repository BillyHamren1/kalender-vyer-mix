import { useMemo } from 'react';
import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { WarehousePersonnelAssignment, WarehouseStaffProductivitySignal } from '@/hooks/useWarehousePersonnelCalendar';

interface Props {
  assignments: WarehousePersonnelAssignment[];
  productivity: WarehouseStaffProductivitySignal[];
  currentDate: Date;
  viewMode: 'day' | 'weekly' | 'monthly' | 'list';
  onOpenAssignment: (assignment: WarehousePersonnelAssignment) => void;
}

const TYPE_LABELS: Record<string, string> = {
  packing: 'Packning',
  return: 'Retur',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
  other: 'Lager',
};

const hhmm = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'HH:mm');
};

const AssignmentCard = ({ item, onOpen }: { item: WarehousePersonnelAssignment; onOpen: (item: WarehousePersonnelAssignment) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(item)}
    className="w-full rounded-lg border border-border/50 bg-background px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
  >
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{TYPE_LABELS[item.assignmentType] || 'Lager'}</span>
      {(item.startTime || item.endTime) && (
        <span className="font-normal normal-case tabular-nums">
          {hhmm(item.startTime)}{item.endTime ? `–${hhmm(item.endTime)}` : ''}
        </span>
      )}
    </div>
    <div className="truncate text-[12px] font-semibold text-foreground">{item.title}</div>
    <div className="truncate text-[10.5px] text-muted-foreground">
      {[item.bookingNumber, item.customerName].filter(Boolean).join(' · ')}
    </div>
  </button>
);

const ProductivityHint = ({ signal }: { signal?: WarehouseStaffProductivitySignal }) => {
  if (!signal || signal.confidence === 'none' || signal.relativeToTypeMedianPct == null) return null;
  const diff = signal.relativeToTypeMedianPct;
  const label = Math.abs(diff) < 5
    ? 'nära normalnivå'
    : diff < 0
      ? `${Math.abs(diff)}% kortare tid än jämförbara jobb`
      : `${diff}% längre tid än jämförbara jobb`;
  return (
    <span
      className="text-[10px] text-muted-foreground"
      title={`Underlag: ${signal.sampleCount} historiska uppdrag. Faktiska tidsstämplar: ${signal.actualSampleCount}. Detta är planeringsstöd, inte ett personalscore.`}
    >
      {label}
    </span>
  );
};

export default function WarehousePersonnelCalendar({ assignments, productivity, currentDate, viewMode, onOpenAssignment }: Props) {
  const days = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate, viewMode]);

  const staff = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    assignments.forEach((item) => map.set(item.staffId, { id: item.staffId, name: item.staffName }));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }, [assignments]);

  const productivityByStaff = useMemo(
    () => new Map(productivity.map((signal) => [signal.staffId, signal])),
    [productivity],
  );

  const byStaffDay = useMemo(() => {
    const map = new Map<string, WarehousePersonnelAssignment[]>();
    assignments.forEach((item) => {
      const key = `${item.staffId}|${item.assignmentDate}`;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    map.forEach((items) => items.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
    return map;
  }, [assignments]);

  if (viewMode === 'list' || viewMode === 'monthly') {
    return (
      <div className="space-y-3">
        {staff.map((person) => {
          const items = assignments
            .filter((item) => item.staffId === person.id)
            .sort((a, b) => `${a.assignmentDate}${a.startTime || ''}`.localeCompare(`${b.assignmentDate}${b.startTime || ''}`));
          return (
            <section key={person.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-foreground">{person.name}</div>
                  <ProductivityHint signal={productivityByStaff.get(person.id)} />
                </div>
              </header>
              <div className="divide-y divide-border/40">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-2 px-4 py-2.5 md:grid-cols-[110px_1fr]">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground">{format(new Date(`${item.assignmentDate}T12:00:00`), 'd MMM', { locale: sv })}</div>
                      <div>{hhmm(item.startTime)}{item.endTime ? `–${hhmm(item.endTime)}` : ''}</div>
                    </div>
                    <AssignmentCard item={item} onOpen={onOpenAssignment} />
                  </div>
                ))}
                {items.length === 0 && <div className="px-4 py-5 text-sm text-muted-foreground">Inget lagerarbete i perioden.</div>}
              </div>
            </section>
          );
        })}
        {staff.length === 0 && <div className="rounded-xl border border-dashed border-border/60 p-8 text-sm text-muted-foreground">Ingen personal är tilldelad lagerarbete i perioden.</div>}
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-border/60 bg-card">
      <div
        className="grid min-w-[980px]"
        style={{ gridTemplateColumns: `190px repeat(${days.length}, minmax(150px, 1fr))` }}
      >
        <div className="sticky left-0 z-20 border-b border-r border-border/50 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          Personal
        </div>
        {days.map((day) => (
          <div key={format(day, 'yyyy-MM-dd')} className="border-b border-r border-border/50 px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{format(day, 'EEE', { locale: sv })}</div>
            <div className="text-sm font-bold text-foreground">{format(day, 'd MMM', { locale: sv })}</div>
          </div>
        ))}

        {staff.map((person) => (
          <div key={person.id} className="contents">
            <div className="sticky left-0 z-10 border-b border-r border-border/50 bg-card px-3 py-3">
              <div className="truncate text-sm font-semibold text-foreground">{person.name}</div>
              <ProductivityHint signal={productivityByStaff.get(person.id)} />
            </div>
            {days.map((day) => {
              const key = `${person.id}|${format(day, 'yyyy-MM-dd')}`;
              const items = byStaffDay.get(key) || [];
              return (
                <div key={key} className={cn('min-h-[116px] border-b border-r border-border/40 p-2', items.length === 0 && 'bg-muted/10')}>
                  <div className="space-y-1.5">
                    {items.map((item) => <AssignmentCard key={item.id} item={item} onOpen={onOpenAssignment} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {staff.length === 0 && <div className="p-8 text-sm text-muted-foreground">Ingen personal är tilldelad lagerarbete i perioden.</div>}
    </div>
  );
}
