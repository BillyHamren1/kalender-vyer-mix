import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays, startOfWeek } from 'date-fns';

export interface WarehouseStaffActivation {
  id: string;
  staff_id: string;
  activation_type: 'permanent' | 'temporary';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStaffMember {
  id: string;
  name: string;
  activation: WarehouseStaffActivation | null;
  isCurrentlyActive: boolean;
}

const QUERY_KEY = ['warehouse-staff-activations'];

export function useWarehouseStaffActivations() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: staffWithActivations = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // Get staff with 'Lager' tag
      const { data: staffMembers, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, tags')
        .eq('is_active', true)
        .contains('tags', ['Lager']);

      if (staffError) throw staffError;

      // Get all activations
      const { data: activations, error: actError } = await supabase
        .from('warehouse_staff_activations')
        .select('*');

      if (actError) throw actError;

      const activationMap = new Map(
        (activations || []).map((a: any) => [a.staff_id, a as WarehouseStaffActivation])
      );

      return (staffMembers || []).map((staff): WarehouseStaffMember => {
        const activation = activationMap.get(staff.id) || null;
        let isCurrentlyActive = false;

        if (activation?.is_active) {
          if (activation.activation_type === 'permanent') {
            isCurrentlyActive = true;
          } else if (activation.activation_type === 'temporary') {
            const start = activation.start_date || today;
            const end = activation.end_date;
            isCurrentlyActive = today >= start && (!end || today <= end);
          }
        }

        return { id: staff.id, name: staff.name, activation, isCurrentlyActive };
      });
    },
  });

  const activatePermanent = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from('warehouse_staff_activations')
        .upsert({
          staff_id: staffId,
          activation_type: 'permanent',
          start_date: today,
          end_date: null,
          is_active: true,
        }, { onConflict: 'staff_id,organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Personal aktiverad tillsvidare');
    },
    onError: () => toast.error('Kunde inte aktivera personal'),
  });

  const activateTemporary = useMutation({
    mutationFn: async ({ staffId, startDate, endDate }: { staffId: string; startDate: string; endDate: string }) => {
      const { error } = await supabase
        .from('warehouse_staff_activations')
        .upsert({
          staff_id: staffId,
          activation_type: 'temporary',
          start_date: startDate,
          end_date: endDate,
          is_active: true,
        }, { onConflict: 'staff_id,organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Personal aktiverad för period');
    },
    onError: () => toast.error('Kunde inte aktivera personal'),
  });

  const deactivate = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from('warehouse_staff_activations')
        .update({ is_active: false })
        .eq('staff_id', staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Personal avaktiverad');
    },
    onError: () => toast.error('Kunde inte avaktivera personal'),
  });

  const activeStaffIds = staffWithActivations
    .filter(s => s.isCurrentlyActive)
    .map(s => s.id);

  return {
    staffWithActivations,
    activeStaffIds,
    isLoading,
    activatePermanent: activatePermanent.mutate,
    activateTemporary: activateTemporary.mutate,
    deactivate: deactivate.mutate,
  };
}

/**
 * Datum-medveten variant: returnerar staff_ids som ska ses som "tillgängliga"
 * i lagerkalendern för ett givet datumintervall.
 *
 * Union av:
 *   1. Permanenta/temporära aktiveringar via warehouse_staff_activations.
 *   2. Personal som planerats i Lager-kolumnen i planeringskalendern
 *      (staff_assignments.team_id = 'transport') inom intervallet.
 *
 * Används av WarehouseCalendarPage för att automatiskt visa personal som
 * dragits in i Lager-kolumnen i planeringskalendern, utan manuell aktivering.
 */
export function useWarehouseAvailableStaff(
  currentDate: Date,
  view: 'day' | 'weekly' | 'monthly' | 'list' = 'weekly',
) {
  const queryClient = useQueryClient();
  const { staffWithActivations, activeStaffIds: permanentlyActiveIds, isLoading: isLoadingActivations } =
    useWarehouseActivations();

  // Bestäm intervall
  const { startKey, endKey } = useMemo(() => {
    if (view === 'day') {
      const k = format(currentDate, 'yyyy-MM-dd');
      return { startKey: k, endKey: k };
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return {
      startKey: format(start, 'yyyy-MM-dd'),
      endKey: format(addDays(start, 6), 'yyyy-MM-dd'),
    };
  }, [currentDate, view]);

  const { data: lagerAssignedStaffIds = [] } = useQuery({
    queryKey: ['warehouse-lager-assigned-staff', startKey, endKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('staff_id')
        .eq('team_id', 'transport')
        .gte('assignment_date', startKey)
        .lte('assignment_date', endKey);
      if (error) throw error;
      return Array.from(new Set((data || []).map((r: any) => r.staff_id)));
    },
  });

  // Realtime: invalidera när staff_assignments ändras
  useEffect(() => {
    const channel = supabase
      .channel(`warehouse-lager-assignments-${startKey}-${endKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_assignments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['warehouse-lager-assigned-staff'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, startKey, endKey]);

  const activeStaffIds = useMemo(
    () => Array.from(new Set([...permanentlyActiveIds, ...lagerAssignedStaffIds])),
    [permanentlyActiveIds, lagerAssignedStaffIds],
  );

  return {
    staffWithActivations,
    activeStaffIds,
    isLoading: isLoadingActivations,
  };
}

// Internt alias så useWarehouseAvailableStaff kan återanvända baslogiken
const useWarehouseActivations = useWarehouseStaffActivations;
