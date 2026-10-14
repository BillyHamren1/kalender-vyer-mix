/**
 * QuickAssignStaffPopover — klick på bemanningscellen i lageröversikten öppnar
 * en liten lista med aktiv personal. Ett klick = personen är bemannad.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserRound, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  assignStaffToPacking,
  assignStaffToWarehouseEvent,
  removeStaffFromPacking,
  removeStaffFromWarehouseEvent,
} from '@/services/warehouseAssignmentsSync';
import { cn } from '@/lib/utils';
import { warehouseDateOf, warehouseTimeOf } from '@/lib/warehouse/warehouseTime';
import { conflictingJobs, durationMinutes } from '@/lib/warehouse/personnelPlanning';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

interface Props {
  packingId?: string;
  warehouseEventId?: string;
  packingName?: string | null;
  /** Display-only backwards-compatible input; identity always comes from assignment IDs. */
  assignedNames: string[];
  label: string;
  muted: boolean;
}

interface StaffOption {
  id: string;
  name: string;
  is_active: boolean;
  tags: string[] | null;
}

const QuickAssignStaffPopover: React.FC<Props> = ({
  packingId,
  warehouseEventId,
  packingName,
  label,
  muted,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const queryClient = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const targetId = warehouseEventId || packingId || '';
  const targetKind = warehouseEventId ? 'event' : 'packing';

  const { data: staff = [], isLoading, isError: staffError, refetch: refetchStaff } = useQuery<StaffOption[]>({
    queryKey: ['warehouse-quick-assign-staff', organizationId],
    enabled: open && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, is_active, tags')
        .eq('organization_id', organizationId!)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as StaffOption[];
    },
  });

  const { data: assigned = [], refetch: refetchAssigned, isFetching: assignedLoading, isError: assignedError } = useQuery<
    { assignmentId: string; staffId: string }[]
  >({
    queryKey: ['warehouse-quick-assign-current', organizationId, targetKind, targetId],
    enabled: open && !!organizationId && !!targetId,
    staleTime: 0,
    queryFn: async () => {
      let assignmentQuery = supabase
        .from('warehouse_assignments')
        .select('id, staff_id')
        .eq('organization_id', organizationId!);
      assignmentQuery = warehouseEventId
        ? assignmentQuery.eq('warehouse_event_id', warehouseEventId)
        : assignmentQuery.eq('packing_id', packingId!).is('warehouse_event_id', null);
      const { data, error } = await assignmentQuery;
      if (error) throw error;
      return (data || []).map((row) => ({ assignmentId: row.id, staffId: row.staff_id }));
    },
  });

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.staffId)), [assigned]);
  const context = useQuery({
    queryKey: ['warehouse-quick-assign-context', organizationId, targetKind, targetId],
    enabled: open && !!organizationId && !!targetId,
    staleTime: 0,
    queryFn: async () => {
      let date: string | null = null;
      let start: string | null = null;
      let end: string | null = null;
      let sameDayWindow = false;
      if (warehouseEventId) {
        const { data, error } = await supabase.from('warehouse_calendar_events').select('start_time, end_time').eq('organization_id', organizationId!).eq('id', warehouseEventId).single();
        if (error) throw error;
        date = warehouseDateOf(data.start_time); start = warehouseTimeOf(data.start_time); end = warehouseTimeOf(data.end_time);
        sameDayWindow = !!date && warehouseDateOf(data.end_time) === date;
      } else {
        const { data, error } = await supabase.from('packing_projects').select('start_date').eq('organization_id', organizationId!).eq('id', packingId!).single();
        if (error) throw error;
        date = data.start_date;
      }
      if (!date) return { date, availability: [], jobs: [], start, end, sameDayWindow };
      const [availability, jobs] = await Promise.all([
        supabase.from('staff_availability').select('staff_id, availability_type').eq('organization_id', organizationId!).lte('start_date', date).gte('end_date', date),
        supabase.from('warehouse_assignments').select('staff_id, warehouse_event_id, packing_id, start_time, end_time, status').eq('organization_id', organizationId!).eq('assignment_date', date),
      ]);
      if (availability.error) throw availability.error;
      if (jobs.error) throw jobs.error;
      return { date, start, end, sameDayWindow, availability: availability.data || [], jobs: (jobs.data || []).filter(job => warehouseEventId ? job.warehouse_event_id !== warehouseEventId : job.packing_id !== packingId).filter(job => !['completed', 'cancelled'].includes(job.status)) };
    },
  });
  const staffContext = (staffId: string) => {
    const value = context.data;
    if (!value?.date) return 'Datum saknas · kontrollera tillgänglighet';
    const periods = value.availability.filter(item => item.staff_id === staffId);
    const absence = periods.some(item => ['unavailable', 'blocked'].includes(item.availability_type));
    const jobs = value.jobs.filter(job => job.staff_id === staffId);
    const target = { date: value.date, startTime: value.start, endTime: value.end };
    const incompleteTimes = !value.sameDayWindow || durationMinutes(target) === null || jobs.some(job => warehouseDateOf(job.start_time) !== value.date || warehouseDateOf(job.end_time) !== value.date || durationMinutes({date: value.date!, startTime: warehouseTimeOf(job.start_time), endTime: warehouseTimeOf(job.end_time)}) === null);
    const conflict = !incompleteTimes && jobs.some(job => conflictingJobs([target, { date: value.date!, startTime: warehouseTimeOf(job.start_time), endTime: warehouseTimeOf(job.end_time) }]).size > 0);
    return [absence ? 'Frånvaro / blockerad' : periods.some(item => item.availability_type === 'available') ? 'Anmäld tillgänglig' : 'Tillgänglighet ej angiven', conflict ? 'Tidskonflikt med lagerjobb' : incompleteTimes ? 'Tidskonflikter kan inte bedömas · kontrollera tider och dygn' : jobs.length ? `${jobs.length} andra lagerjobb denna dag` : 'Inga andra lagerjobb'].join(' · ');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(s => (assignedIds.has(s.id) || (s.is_active && s.tags?.includes('Lager'))) && (!q || s.name.toLowerCase().includes(q)));
  }, [staff, search, assignedIds]);

  const refreshBoards = async () => {
    queryClient.invalidateQueries({ queryKey: ['warehouse-ops-range'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-ops-board'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-personnel-week'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-card-event-crew'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-job-detail'] });
    await refetchAssigned();
    await queryClient.invalidateQueries({ queryKey: ['warehouse-quick-assign-context'] });
  };

  const toggle = async (s: StaffOption) => {
    if (mutationLock.current || assignedLoading || assignedError || !targetId || !organizationId) return;
    mutationLock.current = true;
    const isAssigned = assignedIds.has(s.id);
    setBusyId(s.id);
    try {
    const res = warehouseEventId
      ? isAssigned
        ? await removeStaffFromWarehouseEvent({ staffId: s.id, warehouseEventId })
        : await assignStaffToWarehouseEvent({ staffId: s.id, warehouseEventId })
      : isAssigned
        ? await removeStaffFromPacking({ staffId: s.id, packingId: packingId! })
        : await assignStaffToPacking({ staffId: s.id, packingId: packingId! });
    if (res.ok) {
      toast.success(isAssigned ? `${s.name} borttagen` : `${s.name} bemannad`);
      await refreshBoards();
    } else {
      toast.error(
        isAssigned ? 'Kunde inte ta bort' : 'Kunde inte bemanna',
        res.error ? { description: res.error } : undefined,
      );
    }
    } catch { toast.error('Kunde inte spara bemanningen. Försök igen.'); }
    finally { mutationLock.current = false; setBusyId(null); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={cn(
            'flex items-center gap-1.5 text-sm rounded-md px-1.5 py-1 -mx-1.5 max-w-full text-left transition-colors hover:bg-accent/60',
            muted ? 'text-amber-700' : 'text-[hsl(var(--heading))]',
          )}
        >
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] p-2 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {packingName && (
          <p className="text-[11px] text-muted-foreground truncate px-1 pb-1.5">{packingName}</p>
        )}
        <p className="px-1 pb-2 text-xs text-muted-foreground">{context.data?.date || 'Datum ej angivet'} · Visar registrerad tillgänglighet och lagerjobb, inte fullständigt arbetsschema.</p>
        <Input
          autoFocus
          placeholder="Sök personal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {staffError || assignedError || context.isError ? (<div role="alert" className="p-2 text-sm"><p>Kunde inte läsa aktuell bemanning eller tillgänglighet.</p><button type="button" className="underline py-2" onClick={() => { void refetchStaff(); void refetchAssigned(); void context.refetch(); }}>Försök igen</button></div>) : isLoading || assignedLoading || context.isFetching ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen aktiv personal märkt Lager hittades. Kontrollera personalregistret och sökningen.</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const isAssigned =
                  assignedIds.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!!busyId || !organizationId || !targetId}
                      aria-pressed={isAssigned}
                      onClick={() => toggle(s)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors',
                        isAssigned && 'text-emerald-700 font-medium',
                      )}
                    >
                      <span><span className="block">{s.name}</span><span className="block text-xs font-normal text-muted-foreground">{staffContext(s.id)}</span></span>
                      {busyId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : isAssigned ? (
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Check className="h-3.5 w-3.5" />
                          <X className="h-3 w-3 opacity-50" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickAssignStaffPopover;
