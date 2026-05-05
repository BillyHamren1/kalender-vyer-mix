import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useCurrentOrg } from './useCurrentOrg';

/**
 * Canonical query for "new bookings awaiting project assignment".
 * Rules:
 * - status = CONFIRMED
 * - not assigned to any project (assigned_to_project IS NOT TRUE)
 * - not linked to a large project (large_project_id IS NULL)
 * - at least one future date (eventdate, rigdaydate, or rigdowndate >= today)
 * - filtered by current organization_id (multi-tenant)
 */
async function fetchProjectInboxCount(orgId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, eventdate, rigdaydate, rigdowndate')
    .eq('organization_id', orgId)
    .eq('status', 'CONFIRMED')
    .is('large_project_id', null)
    .or('assigned_to_project.is.null,assigned_to_project.eq.false');

  if (error) {
    console.error('Error fetching project inbox count:', error);
    return 0;
  }

  return (data ?? []).filter(b => {
    const dates = [b.eventdate, b.rigdaydate, b.rigdowndate].filter(Boolean);
    if (dates.length === 0) return false;
    return dates.some(d => d! >= today);
  }).length;
}

/**
 * Hook that returns the project inbox count with realtime updates.
 * Returns 0 when no organization is active.
 */
export function useProjectInboxCount(): number {
  const { organizationId } = useCurrentOrg();

  const { data: count = 0, refetch } = useQuery({
    queryKey: ['project-inbox-count', organizationId],
    queryFn: () => fetchProjectInboxCount(organizationId!),
    enabled: !!organizationId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!organizationId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refetch(); }, 400);
    };
    const channel = supabase
      .channel('project-inbox-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, schedule)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refetch, organizationId]);

  return organizationId ? count : 0;
}
