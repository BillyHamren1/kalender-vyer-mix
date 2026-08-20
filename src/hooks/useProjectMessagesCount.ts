import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStaffId } from './useCurrentStaffId';

const LOOKBACK_DAYS = 30;

const readByIds = (readBy: unknown): string[] => {
  if (Array.isArray(readBy)) return readBy.map((v) => String(v));
  if (readBy && typeof readBy === 'object') return Object.keys(readBy as Record<string, unknown>);
  return [];
};

/**
 * Antal olästa projektmeddelanden (job_messages) för inloggad användare.
 * Dual-identity: både auth-user-id och staff_members.id räknas som "jag".
 */
export function useProjectMessagesCount(): number {
  const { organizationId } = useCurrentOrg();
  const { user } = useAuth();
  const { staffId } = useCurrentStaffId();

  const myIds = [user?.id, staffId].filter(Boolean) as string[];

  const { data: count = 0, refetch } = useQuery({
    queryKey: ['project-messages-count', organizationId, myIds.join('|')],
    enabled: !!organizationId && myIds.length > 0,
    staleTime: 30000,
    queryFn: async () => {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
      const { data, error } = await supabase
        .from('job_messages')
        .select('id, sender_id, read_by, created_at')
        .eq('organization_id', organizationId!)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) return 0;
      return (data || []).filter((m) => {
        if (myIds.includes(String(m.sender_id))) return false;
        const seen = readByIds(m.read_by);
        return !myIds.some((id) => seen.includes(id));
      }).length;
    },
  });

  useEffect(() => {
    if (!organizationId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refetch(); }, 500);
    };
    const channel = supabase
      .channel('project-messages-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_messages' }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [organizationId, refetch]);

  return organizationId ? count : 0;
}
