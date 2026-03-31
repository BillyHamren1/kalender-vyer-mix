import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProjectTeamMember {
  id: string; // BSA row id
  staff_id: string;
  staff_name: string;
  role: string; // 'field' | 'project_manager' | 'coordinator'
  assignment_date: string;
  team_id: string;
}

/**
 * Fetches the project team from booking_staff_assignments for a given booking.
 * Returns unique staff members (deduplicated across dates).
 */
export const useProjectTeam = (bookingId: string | null) => {
  const queryClient = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ['project-team', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];

      const { data: bsaRows, error } = await supabase
        .from('booking_staff_assignments')
        .select('id, staff_id, team_id, assignment_date, role')
        .eq('booking_id', bookingId);

      if (error) throw error;
      if (!bsaRows || bsaRows.length === 0) return [];

      // Get unique staff IDs
      const staffIds = [...new Set(bsaRows.map(r => r.staff_id))];

      // Fetch staff names
      const { data: staffMembers } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', staffIds);

      // Also check profiles for system users (project managers etc)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', staffIds);

      const nameMap = new Map<string, string>();
      (staffMembers || []).forEach(s => nameMap.set(s.id, s.name));
      (profiles || []).forEach(p => {
        if (!nameMap.has(p.user_id)) {
          nameMap.set(p.user_id, p.full_name || p.email || 'Okänd');
        }
      });

      // Deduplicate: one entry per staff_id, pick the latest role
      const staffMap = new Map<string, ProjectTeamMember>();
      for (const row of bsaRows) {
        const existing = staffMap.get(row.staff_id);
        // Prefer non-field roles (project_manager > field)
        const role = (row as any).role || 'field';
        if (!existing || (role !== 'field' && existing.role === 'field')) {
          staffMap.set(row.staff_id, {
            id: row.id,
            staff_id: row.staff_id,
            staff_name: nameMap.get(row.staff_id) || row.staff_id,
            role,
            assignment_date: row.assignment_date,
            team_id: row.team_id,
          });
        }
      }

      return Array.from(staffMap.values());
    },
    enabled: !!bookingId,
  });

  const addTeamMemberMutation = useMutation({
    mutationFn: async ({ staffId, role, dates }: { staffId: string; role: string; dates: string[] }) => {
      if (!bookingId) throw new Error('Ingen bokning kopplad');
      
      const rows = dates.map(date => ({
        booking_id: bookingId,
        staff_id: staffId,
        team_id: role === 'field' ? 'activity' : 'project_team',
        assignment_date: date,
        role,
      }));

      const { error } = await supabase
        .from('booking_staff_assignments')
        .upsert(rows as any, { onConflict: 'booking_id,staff_id,assignment_date', ignoreDuplicates: true });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', bookingId] });
      toast.success('Teammedlem tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till teammedlem'),
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async (staffId: string) => {
      if (!bookingId) throw new Error('Ingen bokning kopplad');

      // Remove all BSA rows for this staff on this booking where role is not 'field'
      // For project_manager/coordinator, remove their project_team rows
      const { error } = await supabase
        .from('booking_staff_assignments')
        .delete()
        .eq('booking_id', bookingId)
        .eq('staff_id', staffId)
        .eq('team_id', 'project_team');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', bookingId] });
      toast.success('Teammedlem borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort teammedlem'),
  });

  const teamMembers = teamQuery.data || [];
  const fieldStaff = teamMembers.filter(m => m.role === 'field');
  const projectStaff = teamMembers.filter(m => m.role !== 'field');

  return {
    teamMembers,
    fieldStaff,
    projectStaff,
    isLoading: teamQuery.isLoading,
    addTeamMember: addTeamMemberMutation.mutateAsync,
    removeTeamMember: removeTeamMemberMutation.mutate,
    isAdding: addTeamMemberMutation.isPending,
  };
};
