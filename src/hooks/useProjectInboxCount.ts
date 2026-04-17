import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

/**
 * Canonical query for "new bookings awaiting project assignment".
 * Rules:
 * - status = CONFIRMED
 * - not assigned to any project (assigned_to_project IS NOT TRUE)
 * - not linked to a large project (large_project_id IS NULL)
 * - at least one future date (eventdate, rigdaydate, or rigdowndate >= today)
 */
async function fetchProjectInboxCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10); // yyyy-MM-dd

  // We need to count bookings matching all criteria.
  // Supabase doesn't support OR across columns in .or() with date comparisons easily,
  // so we use a raw count query via rpc or a workaround.
  // Simplest: fetch IDs with filters and count client-side.
  const { data, error } = await supabase
    .from('bookings')
    .select('id, eventdate, rigdaydate, rigdowndate')
    .eq('status', 'CONFIRMED')
    .is('large_project_id', null)
    .or('assigned_to_project.is.null,assigned_to_project.eq.false');

  if (error) {
    console.error('Error fetching project inbox count:', error);
    return 0;
  }

  // Filter: at least one relevant date is today or in the future
  return (data ?? []).filter(b => {
    const dates = [b.eventdate, b.rigdaydate, b.rigdowndate].filter(Boolean);
    if (dates.length === 0) return false;
    return dates.some(d => d! >= today);
  }).length;
}

/**
 * Hook that returns the project inbox count with realtime updates.
 * Use this everywhere you need the "new bookings" badge count.
 */
export function useProjectInboxCount(): number {
  const { data: count = 0, refetch } = useQuery({
    queryKey: ['project-inbox-count'],
    queryFn: fetchProjectInboxCount,
    staleTime: 30000,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refetch(); }, 400);
    };
    const channel = supabase
      .channel('project-inbox-badge')
      // INSERT: brand new booking → may belong in inbox
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, schedule)
      // UPDATE: status / assignment / dates change can move bookings in or out of the inbox
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, schedule)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return count;
}
