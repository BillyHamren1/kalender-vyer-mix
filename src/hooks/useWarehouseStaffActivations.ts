import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
