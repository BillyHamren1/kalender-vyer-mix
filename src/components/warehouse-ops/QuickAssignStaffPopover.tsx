/**
 * QuickAssignStaffPopover — klick på bemanningscellen i lageröversikten öppnar
 * en liten lista med aktiv personal. Ett klick = personen är bemannad.
 */
import React, { useMemo, useState } from 'react';
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
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

interface Props {
  packingId?: string;
  warehouseEventId?: string;
  packingName?: string | null;
  /** Namn på redan bemannad personal (för markering i listan). */
  assignedNames: string[];
  label: string;
  muted: boolean;
}

interface StaffOption {
  id: string;
  name: string;
}

const QuickAssignStaffPopover: React.FC<Props> = ({
  packingId,
  warehouseEventId,
  packingName,
  assignedNames,
  label,
  muted,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const targetId = warehouseEventId || packingId || '';
  const targetKind = warehouseEventId ? 'event' : 'packing';

  const { data: staff = [], isLoading } = useQuery<StaffOption[]>({
    queryKey: ['warehouse-quick-assign-staff', organizationId],
    enabled: open && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('organization_id', organizationId!)
        .eq('is_active', true)
        .contains('tags', ['Lager'])
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as StaffOption[];
    },
  });

  const { data: assigned = [], refetch: refetchAssigned } = useQuery<
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
        : assignmentQuery.eq('packing_id', packingId!);
      const { data, error } = await assignmentQuery;
      if (error) throw error;
      return (data || []).map((row) => ({ assignmentId: row.id, staffId: row.staff_id }));
    },
  });

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.staffId)), [assigned]);
  const assignedNameSet = useMemo(
    () => new Set(assignedNames.map((n) => n.trim().toLowerCase())),
    [assignedNames],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((s) => s.name.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  const refreshBoards = () => {
    queryClient.invalidateQueries({ queryKey: ['warehouse-ops-range'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-ops-board'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-personnel-week'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-card-event-crew'] });
    void refetchAssigned();
  };

  const toggle = async (s: StaffOption) => {
    const isAssigned = assignedIds.has(s.id);
    setBusyId(s.id);
    const res = warehouseEventId
      ? isAssigned
        ? await removeStaffFromWarehouseEvent({ staffId: s.id, warehouseEventId })
        : await assignStaffToWarehouseEvent({ staffId: s.id, warehouseEventId })
      : isAssigned
        ? await removeStaffFromPacking({ staffId: s.id, packingId: packingId! })
        : await assignStaffToPacking({ staffId: s.id, packingId: packingId! });
    setBusyId(null);
    if (res.ok) {
      toast.success(isAssigned ? `${s.name} borttagen` : `${s.name} bemannad`);
      refreshBoards();
    } else {
      toast.error(isAssigned ? 'Kunde inte ta bort' : 'Kunde inte bemanna');
    }
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
        className="w-64 p-2 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {packingName && (
          <p className="text-[11px] text-muted-foreground truncate px-1 pb-1.5">{packingName}</p>
        )}
        <Input
          autoFocus
          placeholder="Sök personal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen personal hittades</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const isAssigned =
                  assignedIds.has(s.id) || assignedNameSet.has(s.name.trim().toLowerCase());
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => toggle(s)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors',
                        isAssigned && 'text-emerald-700 font-medium',
                      )}
                    >
                      <span className="truncate">{s.name}</span>
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
