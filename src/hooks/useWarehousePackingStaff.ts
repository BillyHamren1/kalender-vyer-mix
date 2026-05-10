/**
 * useWarehousePackingStaff
 * ------------------------
 * Returns the canonical "who is assigned to this packing?" view used by the
 * warehouse UI:
 *   - assigned: list of { staff_id, name, source } from warehouse_assignments
 *   - inTimeApp: true if at least one warehouse_assignments row exists for the
 *     packing — meaning a staff member will see it under Lager in the Time-app.
 *
 * Realtime: refetches on warehouse_assignments mutations.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PackingAssignedStaff {
  assignment_id: string;
  staff_id: string;
  name: string;
  source: string | null;
  status: string | null;
}

export interface PackingStaffSnapshot {
  loading: boolean;
  assigned: PackingAssignedStaff[];
  inTimeApp: boolean;
  refresh: () => void;
}

export function useWarehousePackingStaff(packingId: string | null | undefined): PackingStaffSnapshot {
  const [loading, setLoading] = useState(true);
  const [assigned, setAssigned] = useState<PackingAssignedStaff[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!packingId) {
      setAssigned([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('warehouse_assignments')
        .select('id, staff_id, source, status')
        .eq('packing_id', packingId);
      if (cancelled) return;
      if (error) {
        console.warn('[useWarehousePackingStaff] failed', error);
        setAssigned([]);
        setLoading(false);
        return;
      }
      const staffIds = Array.from(new Set((data || []).map((r: any) => r.staff_id).filter(Boolean)));
      let nameById = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .from('staff')
          .select('id, name')
          .in('id', staffIds);
        nameById = new Map((staff || []).map((s: any) => [s.id, s.name as string]));
      }
      if (cancelled) return;
      setAssigned(
        (data || []).map((r: any) => ({
          assignment_id: r.id,
          staff_id: r.staff_id,
          name: nameById.get(r.staff_id) || 'Personal',
          source: r.source ?? null,
          status: r.status ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [packingId, tick]);

  // Realtime: refresh on any change to warehouse_assignments for this packing.
  useEffect(() => {
    if (!packingId) return;
    const channel = supabase
      .channel(`wa-packing-${packingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_assignments', filter: `packing_id=eq.${packingId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [packingId, refresh]);

  return {
    loading,
    assigned,
    inTimeApp: assigned.length > 0,
    refresh,
  };
}
