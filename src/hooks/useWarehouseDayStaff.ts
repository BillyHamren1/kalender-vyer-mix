import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

export interface DayStaff { id: string; name: string; inWarehouseToday: boolean }

/** Aktiv personal; de som är schemalagda i ett lagerteam idag sorteras först. */
export function useWarehouseDayStaff(day: string) {
  const { organizationId } = useCurrentOrg();
  return useQuery<DayStaff[]>({
    queryKey: ['warehouse-day-staff', organizationId, day],
    enabled: !!organizationId,
    queryFn: async () => {
      const [staff, sched] = await Promise.all([
        supabase.from('staff_members').select('id,name,is_active').eq('organization_id', organizationId!).order('name'),
        supabase.from('staff_assignments').select('staff_id,team_id').eq('organization_id', organizationId!)
          .eq('assignment_date', day).like('team_id', 'lager-%'),
      ]);
      if (staff.error) throw staff.error;
      if (sched.error) throw sched.error;
      const today = new Set((sched.data || []).map((r) => r.staff_id));
      return (staff.data || [])
        .filter((s: any) => s.is_active !== false)
        .map((s: any) => ({ id: s.id, name: s.name, inWarehouseToday: today.has(s.id) }))
        .sort((a, b) => Number(b.inWarehouseToday) - Number(a.inWarehouseToday) || a.name.localeCompare(b.name, 'sv'));
    },
  });
}
