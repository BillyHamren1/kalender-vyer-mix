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
  // Måste matcha IncomingBookingsList 1:1 (samma filter, inget datumkrav)
  const { data: candidates, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'CONFIRMED')
    .is('large_project_id', null)
    .or('assigned_to_project.is.null,assigned_to_project.eq.false');

  if (error) {
    console.error('Error fetching project inbox count:', error);
    return 0;
  }
  if (!candidates || candidates.length === 0) return 0;

  const candidateIds = candidates.map(b => b.id);
  const [{ data: activeJobs }, { data: activeProjects }, { data: largeLinks }] = await Promise.all([
    supabase.from('jobs').select('booking_id').in('booking_id', candidateIds).is('deleted_at', null).not('status', 'in', '("completed","cancelled")'),
    supabase.from('projects').select('booking_id').in('booking_id', candidateIds).not('status', 'in', '("completed","cancelled")'),
    supabase.from('large_project_bookings').select('booking_id').in('booking_id', candidateIds),
  ]);
  const assigned = new Set([
    ...(activeJobs || []).map(j => j.booking_id),
    ...(activeProjects || []).map(p => p.booking_id),
    ...(largeLinks || []).map(l => l.booking_id),
  ]);
  return candidates.filter(b => !assigned.has(b.id)).length;
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
