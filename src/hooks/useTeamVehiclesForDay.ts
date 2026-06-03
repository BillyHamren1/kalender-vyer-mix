import { useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVehicles, type Vehicle } from '@/hooks/useVehicles';

interface AssignmentRow {
  id: string;
  team_id: string;
  vehicle_id: string;
  date: string;
}

const TVA_KEY = (isoDate: string) => ['team_vehicle_assignments', isoDate] as const;

// ---------------------------------------------------------------------------
// Singleton realtime channel for team_vehicle_assignments.
// One subscription regardless of how many days/components are mounted.
// ---------------------------------------------------------------------------
let tvaChannel: ReturnType<typeof supabase.channel> | null = null;
let tvaSubscribers = 0;

function ensureTvaRealtime(onChange: (date: string | null) => void) {
  tvaSubscribers += 1;
  if (!tvaChannel) {
    tvaChannel = supabase
      .channel('team-vehicle-assignments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_vehicle_assignments' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<AssignmentRow> | undefined;
          onChange(row?.date ?? null);
        }
      )
      .subscribe();
  }
  return () => {
    tvaSubscribers = Math.max(0, tvaSubscribers - 1);
    if (tvaSubscribers === 0 && tvaChannel) {
      supabase.removeChannel(tvaChannel);
      tvaChannel = null;
    }
  };
}

async function fetchAssignmentsForDate(isoDate: string): Promise<AssignmentRow[]> {
  const { data, error } = await supabase
    .from('team_vehicle_assignments')
    .select('id, team_id, vehicle_id, date')
    .eq('date', isoDate);
  if (error) throw error;
  return (data as AssignmentRow[]) || [];
}

async function fetchAssignmentsForDates(isoDates: string[]): Promise<AssignmentRow[]> {
  if (isoDates.length === 0) return [];
  const { data, error } = await supabase
    .from('team_vehicle_assignments')
    .select('id, team_id, vehicle_id, date')
    .in('date', isoDates);
  if (error) throw error;
  return (data as AssignmentRow[]) || [];
}

/**
 * Prefetch + cache-seed team-vehicle assignments for a list of dates in ONE
 * query. Each date gets its own React Query cache entry (keyed by isoDate) so
 * subsequent useTeamVehiclesForDay(day) calls hit the cache instantly.
 *
 * Use this from any parent that knows the visible date range (e.g. CustomCalendar).
 */
export function useTeamVehiclesPrefetch(days: Date[] | undefined): void {
  const queryClient = useQueryClient();

  const isoDates = useMemo(() => {
    if (!days || days.length === 0) return [] as string[];
    const unique = new Set<string>();
    days.forEach((d) => unique.add(format(d, 'yyyy-MM-dd')));
    return Array.from(unique).sort();
  }, [days]);

  const cacheKey = isoDates.join('|');

  // Single batched query covering all dates. Seeds per-date cache below.
  useQuery({
    queryKey: ['team_vehicle_assignments', 'batch', cacheKey],
    enabled: isoDates.length > 0,
    queryFn: async () => {
      const rows = await fetchAssignmentsForDates(isoDates);
      const byDate = new Map<string, AssignmentRow[]>();
      isoDates.forEach((d) => byDate.set(d, []));
      rows.forEach((r) => {
        const list = byDate.get(r.date);
        if (list) list.push(r);
        else byDate.set(r.date, [r]);
      });
      // Seed per-date cache entries so individual hooks resolve from cache.
      byDate.forEach((list, date) => {
        queryClient.setQueryData(TVA_KEY(date), list);
      });
      return rows;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Single shared realtime channel — invalidate only the affected date(s).
  useEffect(() => {
    if (isoDates.length === 0) return;
    const off = ensureTvaRealtime((changedDate) => {
      if (changedDate && isoDates.includes(changedDate)) {
        queryClient.invalidateQueries({ queryKey: TVA_KEY(changedDate) });
        queryClient.invalidateQueries({ queryKey: ['team_vehicle_assignments', 'batch', cacheKey] });
      } else if (!changedDate) {
        queryClient.invalidateQueries({ queryKey: ['team_vehicle_assignments'] });
      }
    });
    return off;
  }, [cacheKey, isoDates, queryClient]);
}

/**
 * Tilldelar egna (interna, aktiva) fordon till team per datum.
 * En tilldelning per (team_id, date, vehicle_id).
 *
 * Per-dag-hook. Använd `useTeamVehiclesPrefetch(days)` i kalender-parent för
 * att batcha hämtningen för alla synliga dagar (delad cache + en realtime-kanal).
 */
export const useTeamVehiclesForDay = (day: Date) => {
  const isoDate = useMemo(() => format(day, 'yyyy-MM-dd'), [day]);
  const queryClient = useQueryClient();
  const { vehicles, isLoading: vehiclesLoading } = useVehicles();

  const ownVehicles = useMemo(
    () => vehicles.filter((v) => !v.is_external && v.is_active),
    [vehicles]
  );

  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: TVA_KEY(isoDate),
    queryFn: () => fetchAssignmentsForDate(isoDate),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Ensure realtime is alive while this hook is mounted. Cheap if prefetch
  // already started it (ref-counted).
  useEffect(() => {
    const off = ensureTvaRealtime((changedDate) => {
      if (!changedDate || changedDate === isoDate) {
        queryClient.invalidateQueries({ queryKey: TVA_KEY(isoDate) });
      }
    });
    return off;
  }, [isoDate, queryClient]);

  const vehicleById = useMemo(() => {
    const m = new Map<string, Vehicle>();
    ownVehicles.forEach((v) => m.set(v.id, v));
    return m;
  }, [ownVehicles]);

  const vehiclesByTeam = useMemo(() => {
    const m = new Map<string, Vehicle[]>();
    rows.forEach((r) => {
      const v = vehicleById.get(r.vehicle_id);
      if (!v) return;
      const list = m.get(r.team_id) ?? [];
      list.push(v);
      m.set(r.team_id, list);
    });
    m.forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    );
    return m;
  }, [rows, vehicleById]);

  const setRowsCache = useCallback(
    (updater: (prev: AssignmentRow[]) => AssignmentRow[]) => {
      queryClient.setQueryData<AssignmentRow[]>(TVA_KEY(isoDate), (prev) =>
        updater(prev ?? [])
      );
    },
    [isoDate, queryClient]
  );

  const assign = useCallback(
    async (teamId: string, vehicleId: string) => {
      const optimistic: AssignmentRow = {
        id: `tmp-${Date.now()}`,
        team_id: teamId,
        vehicle_id: vehicleId,
        date: isoDate,
      };
      setRowsCache((prev) => [...prev, optimistic]);
      const { error } = await supabase
        .from('team_vehicle_assignments')
        .insert({ team_id: teamId, vehicle_id: vehicleId, date: isoDate });
      if (error) {
        if ((error as any).code !== '23505') {
          console.error('[useTeamVehiclesForDay] assign error', error);
          toast.error('Kunde inte koppla bilen');
          setRowsCache((prev) => prev.filter((r) => r.id !== optimistic.id));
        }
      }
      queryClient.invalidateQueries({ queryKey: TVA_KEY(isoDate) });
    },
    [isoDate, queryClient, setRowsCache]
  );

  const unassign = useCallback(
    async (teamId: string, vehicleId: string) => {
      const snapshot = rows;
      setRowsCache((prev) =>
        prev.filter((r) => !(r.team_id === teamId && r.vehicle_id === vehicleId))
      );
      const { error } = await supabase
        .from('team_vehicle_assignments')
        .delete()
        .eq('date', isoDate)
        .eq('team_id', teamId)
        .eq('vehicle_id', vehicleId);
      if (error) {
        console.error('[useTeamVehiclesForDay] unassign error', error);
        toast.error('Kunde inte ta bort bilen');
        setRowsCache(() => snapshot);
      }
    },
    [isoDate, rows, setRowsCache]
  );

  return {
    ownVehicles,
    vehiclesByTeam,
    assign,
    unassign,
    isLoading: vehiclesLoading || rowsLoading,
  };
};

export type UseTeamVehiclesForDay = ReturnType<typeof useTeamVehiclesForDay>;
