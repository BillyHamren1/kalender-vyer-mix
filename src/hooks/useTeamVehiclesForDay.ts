import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVehicles, type Vehicle } from '@/hooks/useVehicles';

interface AssignmentRow {
  id: string;
  team_id: string;
  vehicle_id: string;
  date: string;
}

/**
 * Tilldelar egna (interna, aktiva) fordon till team per datum.
 * En tilldelning per (team_id, date, vehicle_id).
 * Speglar realtime via postgres_changes.
 */
export const useTeamVehiclesForDay = (day: Date) => {
  const isoDate = useMemo(() => format(day, 'yyyy-MM-dd'), [day]);
  const { vehicles, isLoading: vehiclesLoading } = useVehicles();

  const ownVehicles = useMemo(
    () => vehicles.filter((v) => !v.is_external && v.is_active),
    [vehicles]
  );

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_vehicle_assignments')
        .select('id, team_id, vehicle_id, date')
        .eq('date', isoDate);
      if (error) throw error;
      setRows((data as AssignmentRow[]) || []);
    } catch (err) {
      console.error('[useTeamVehiclesForDay] fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [isoDate]);

  useEffect(() => {
    fetchRows();
    const channel = supabase
      .channel(`tva-${isoDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_vehicle_assignments', filter: `date=eq.${isoDate}` },
        () => fetchRows()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRows, isoDate]);

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
    // Stable order by name
    m.forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    );
    return m;
  }, [rows, vehicleById]);

  const assign = useCallback(
    async (teamId: string, vehicleId: string) => {
      // Optimistic
      const optimistic: AssignmentRow = { id: `tmp-${Date.now()}`, team_id: teamId, vehicle_id: vehicleId, date: isoDate };
      setRows((prev) => [...prev, optimistic]);
      const { error } = await supabase
        .from('team_vehicle_assignments')
        .insert({ team_id: teamId, vehicle_id: vehicleId, date: isoDate });
      if (error) {
        // 23505 unique violation = redan tilldelad, det är ok
        if ((error as any).code !== '23505') {
          console.error('[useTeamVehiclesForDay] assign error', error);
          toast.error('Kunde inte koppla bilen');
          setRows((prev) => prev.filter((r) => r.id !== optimistic.id));
        }
      }
      fetchRows();
    },
    [isoDate, fetchRows]
  );

  const unassign = useCallback(
    async (teamId: string, vehicleId: string) => {
      const snapshot = rows;
      setRows((prev) => prev.filter((r) => !(r.team_id === teamId && r.vehicle_id === vehicleId)));
      const { error } = await supabase
        .from('team_vehicle_assignments')
        .delete()
        .eq('date', isoDate)
        .eq('team_id', teamId)
        .eq('vehicle_id', vehicleId);
      if (error) {
        console.error('[useTeamVehiclesForDay] unassign error', error);
        toast.error('Kunde inte ta bort bilen');
        setRows(snapshot);
      }
    },
    [isoDate, rows]
  );

  return {
    ownVehicles,
    vehiclesByTeam,
    assign,
    unassign,
    isLoading: vehiclesLoading || loading,
  };
};

export type UseTeamVehiclesForDay = ReturnType<typeof useTeamVehiclesForDay>;
