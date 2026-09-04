import React, { useMemo, useState } from 'react';
import {
  format,
  isToday,
  startOfWeek,
  addDays,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { Search, UserRound, UsersRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CalendarEvent, Resource } from './ResourceData';
import type { StaffAssignment, StaffMember } from '@/hooks/useUnifiedStaffOperations';
import { buildPersonnelGanttItems } from '@/lib/calendar/personnelGantt';

type Zoom = 'week' | 'fortnight' | 'month';

interface PersonnelGanttViewProps {
  anchorDate: Date;
  events: CalendarEvent[];
  assignments: StaffAssignment[];
  staff: StaffMember[];
  resources: Resource[];
  isLoading?: boolean;
  onAssignStaff: (staffId: string, teamId: string, date: Date) => Promise<void>;
  onEventClick?: (event: CalendarEvent) => void;
}

const CELL_WIDTH = 124;
const NAME_WIDTH = 220;

const blockClasses = (eventType: string): string => {
  if (eventType === 'rig') return 'border-sky-300 bg-sky-100 text-sky-950';
  if (eventType === 'event') return 'border-violet-300 bg-violet-100 text-violet-950';
  if (eventType === 'rigDown') return 'border-orange-300 bg-orange-100 text-orange-950';
  return 'border-primary/30 bg-primary/10 text-foreground';
};

const PersonnelGanttView: React.FC<PersonnelGanttViewProps> = ({
  anchorDate,
  events,
  assignments,
  staff,
  resources,
  isLoading = false,
  onAssignStaff,
  onEventClick,
}) => {
  const [zoom, setZoom] = useState<Zoom>('fortnight');
  const [query, setQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ staff: StaffMember; date: Date } | null>(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
    const length = zoom === 'week' ? 7 : zoom === 'fortnight' ? 14 : 31;
    return Array.from({ length }, (_, index) => addDays(start, index));
  }, [anchorDate, zoom]);

  const allStaff = useMemo(() => {
    const byId = new Map(staff.map(member => [member.id, member]));
    const visibleDates = new Set(days.map(day => format(day, 'yyyy-MM-dd')));
    for (const assignment of assignments) {
      // Retain an inactive/historical member only when that person actually
      // has a schedule in the currently visible period.
      if (visibleDates.has(assignment.date) && !byId.has(assignment.staffId)) {
        byId.set(assignment.staffId, {
          id: assignment.staffId,
          name: assignment.staffName,
          color: assignment.color,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }, [assignments, days, staff]);

  const visibleStaff = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('sv');
    if (!normalized) return allStaff;
    return allStaff.filter(member => member.name.toLocaleLowerCase('sv').includes(normalized));
  }, [allStaff, query]);

  const items = useMemo(
    () => buildPersonnelGanttItems({ days, assignments, events, resources }),
    [assignments, days, events, resources],
  );
  const eventById = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);
  const itemsByStaff = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildPersonnelGanttItems>>();
    for (const item of items) {
      const list = map.get(item.staffId) || [];
      list.push(item);
      map.set(item.staffId, list);
    }
    return map;
  }, [items]);

  const teamOptions = useMemo(
    () => resources.filter(resource => resource.id !== 'logistics-transport'),
    [resources],
  );

  const saveAssignment = async () => {
    if (!selectedSlot || !selectedTeam) return;
    setSaving(true);
    try {
      await onAssignStaff(selectedSlot.staff.id, selectedTeam, selectedSlot.date);
      setSelectedSlot(null);
      setSelectedTeam('');
    } finally {
      setSaving(false);
    }
  };

  const timelineWidth = days.length * CELL_WIDTH;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UsersRound className="h-4 w-4 text-primary" />
            Personalschema
          </div>
          <p className="text-xs text-muted-foreground">Klicka på en tom dag för att bemanna personen.</p>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Sök personal"
            className="h-9 pl-8"
          />
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
          {([
            ['week', 'Vecka'],
            ['fortnight', '2 veckor'],
            ['month', 'Månad'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium transition-colors',
                zoom === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 overflow-auto">
        <div style={{ minWidth: NAME_WIDTH + timelineWidth }}>
          <div className="sticky top-0 z-30 flex border-b border-border bg-card shadow-sm">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center gap-2 border-r border-border bg-card px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: NAME_WIDTH }}
            >
              <UserRound className="h-4 w-4" /> Personal
            </div>
            <div className="grid" style={{ width: timelineWidth, gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)` }}>
              {days.map(day => (
                <div
                  key={format(day, 'yyyy-MM-dd')}
                  className={cn(
                    'border-r border-border px-2 py-2 text-center',
                    [0, 6].includes(day.getDay()) && 'bg-muted/40',
                    isToday(day) && 'bg-primary/10',
                  )}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(day, 'EEE', { locale: sv }).replace('.', '')}
                  </div>
                  <div className={cn('mt-0.5 text-sm font-semibold', isToday(day) && 'text-primary')}>
                    {format(day, 'd MMM', { locale: sv })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Laddar personalscheman…</div>
          ) : visibleStaff.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Ingen personal matchar sökningen.</div>
          ) : visibleStaff.map(member => {
            const staffItems = itemsByStaff.get(member.id) || [];
            const laneCount = Math.max(1, ...staffItems.map(item => item.lane + 1));
            const rowHeight = Math.max(54, laneCount * 32 + 10);
            return (
              <div key={member.id} className="flex border-b border-border" style={{ minHeight: rowHeight }}>
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-border bg-card px-4"
                  style={{ width: NAME_WIDTH, minHeight: rowHeight }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-foreground"
                    style={{ backgroundColor: member.color || 'hsl(var(--muted))' }}
                  >
                    {member.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-foreground" title={member.name}>{member.name}</span>
                </div>
                <div className="relative shrink-0" style={{ width: timelineWidth, minHeight: rowHeight }}>
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)` }}>
                    {days.map(day => (
                      <button
                        key={format(day, 'yyyy-MM-dd')}
                        type="button"
                        onClick={() => {
                          setSelectedSlot({ staff: member, date: day });
                          setSelectedTeam('');
                        }}
                        className={cn(
                          'border-r border-border transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                          [0, 6].includes(day.getDay()) && 'bg-muted/25',
                          isToday(day) && 'bg-primary/[0.06]',
                        )}
                        aria-label={`Bemanna ${member.name} ${format(day, 'd MMMM', { locale: sv })}`}
                      />
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-0 grid px-1 py-1" style={{ gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)` }}>
                    {staffItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          const source = item.sourceEventId ? eventById.get(item.sourceEventId) : undefined;
                          if (source) onEventClick?.(source);
                        }}
                        className={cn(
                          'pointer-events-auto z-10 mx-1 h-7 min-w-0 overflow-hidden rounded-md border px-2 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md',
                          blockClasses(item.eventType),
                        )}
                        style={{
                          gridColumn: `${item.startIndex + 1} / ${item.endIndex + 2}`,
                          gridRow: 1,
                          position: 'relative',
                          top: item.lane * 32,
                        }}
                        title={`${item.title} · ${item.subtitle}`}
                      >
                        <span className="block truncate text-[11px] font-semibold leading-3.5">{item.title}</span>
                        {item.endIndex > item.startIndex && (
                          <span className="block truncate text-[9px] opacity-70">{item.subtitle}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selectedSlot} onOpenChange={open => !open && setSelectedSlot(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bemanna {selectedSlot?.staff.name}</DialogTitle>
            <DialogDescription>
              {selectedSlot ? format(selectedSlot.date, 'EEEE d MMMM yyyy', { locale: sv }) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="personnel-gantt-team">Team</Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger id="personnel-gantt-team"><SelectValue placeholder="Välj team" /></SelectTrigger>
              <SelectContent>
                {teamOptions.map(team => <SelectItem key={team.id} value={team.id}>{team.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSlot(null)}>Avbryt</Button>
            <Button onClick={saveAssignment} disabled={!selectedTeam || saving}>
              {saving ? 'Sparar…' : 'Bemanna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonnelGanttView;
