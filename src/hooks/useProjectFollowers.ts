import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';

export type ProjectFollowerType = 'standard' | 'large';

export interface ProjectFollower {
  id: string;
  staff_id: string;
  staff_name: string;
  created_at: string;
}

interface Args {
  projectId: string | null;
  projectType: ProjectFollowerType;
}

export const useProjectFollowers = ({ projectId, projectType }: Args) => {
  const queryClient = useQueryClient();
  const { staffId: currentStaffId } = useCurrentStaffId();

  const followersQuery = useQuery({
    queryKey: ['project-followers', projectType, projectId],
    queryFn: async (): Promise<ProjectFollower[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('project_followers')
        .select('id, staff_id, created_at')
        .eq('project_id', projectId)
        .eq('project_type', projectType);
      if (error) throw error;
      const rows = data || [];
      const staffIds = [...new Set(rows.map((r: any) => r.staff_id))];
      let nameMap = new Map<string, string>();
      if (staffIds.length) {
        const { data: members } = await supabase
          .from('staff_members')
          .select('id, name')
          .in('id', staffIds);
        (members || []).forEach((m: any) => nameMap.set(m.id, m.name));
      }
      return rows.map((r: any) => ({
        id: r.id,
        staff_id: r.staff_id,
        staff_name: nameMap.get(r.staff_id) || r.staff_id,
        created_at: r.created_at,
      }));
    },
    enabled: !!projectId,
  });

  const addFollower = useMutation({
    mutationFn: async (staffId: string) => {
      if (!projectId) throw new Error('projectId saknas');
      // Hämta org_id för aktuell staff (RLS kräver matchande org)
      const { data: staff, error: staffErr } = await supabase
        .from('staff_members')
        .select('organization_id')
        .eq('id', staffId)
        .maybeSingle();
      if (staffErr) throw staffErr;
      if (!staff?.organization_id) throw new Error('Personalen saknar organisation');

      const { error } = await supabase.from('project_followers').insert({
        project_id: projectId,
        project_type: projectType,
        staff_id: staffId,
        organization_id: staff.organization_id,
        added_by: currentStaffId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-followers', projectType, projectId] });
      queryClient.invalidateQueries({ queryKey: ['my-projects'] });
      toast.success('Tilldelad');
    },
    onError: (err: any) => {
      if (String(err?.message || '').includes('duplicate')) {
        toast.info('Personen är redan tilldelad');
        return;
      }
      toast.error('Kunde inte tilldela: ' + (err?.message || 'okänt fel'));
    },
  });

  const removeFollower = useMutation({
    mutationFn: async (followerRowId: string) => {
      const { error } = await supabase
        .from('project_followers')
        .delete()
        .eq('id', followerRowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-followers', projectType, projectId] });
      queryClient.invalidateQueries({ queryKey: ['my-projects'] });
      toast.success('Borttagen');
    },
    onError: (err: any) => {
      toast.error('Kunde inte ta bort: ' + (err?.message || 'okänt fel'));
    },
  });

  return {
    followers: followersQuery.data || [],
    isLoading: followersQuery.isLoading,
    addFollower: addFollower.mutate,
    removeFollower: removeFollower.mutate,
    isAdding: addFollower.isPending,
  };
};
