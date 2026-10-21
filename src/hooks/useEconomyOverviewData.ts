import { summarizeEconomyBatches } from '@/lib/economy/batchSummary';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllEconomyDataMulti, type BatchEconomyData } from '@/services/planningApiService';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';
import { useCurrentOrg } from './useCurrentOrg';
import { loadOverviewSources } from '@/lib/economy/loadOverviewSources';

export type ProjectSize = 'small' | 'medium' | 'large';

export interface ProjectWithEconomy {
  id: string;
  name: string;
  status: string;
  booking_id: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  bookingCreatedAt: string | null;
  summary: EconomySummary;
  timeReports: StaffTimeReport[];
  economyClosed: boolean;
  projectSize: ProjectSize;
  navigateTo: string;
  revenueAvailable: boolean;
  booking_ids?: string[];
  economyBatches?: Record<string, BatchEconomyData>;
  economyError?: string;
}

export const useEconomyOverviewData = (enabled = true) => {
  const { organizationId } = useCurrentOrg();
  return useQuery({
    queryKey: ['economy-overview', organizationId],
    enabled: enabled && !!organizationId,
    queryFn: async (): Promise<ProjectWithEconomy[]> => {
      if (!organizationId) return [];
      // Fetch all three project types in parallel
      const [projectsRes, jobsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, status, booking_id')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('id, name, status, booking_id')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('large_projects')
          .select('id, name, status, large_project_bookings(booking_id)')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (largeRes.error) throw largeRes.error;

      // Build unified list with booking IDs
      interface RawEntry {
        id: string;
        name: string;
        status: string;
        booking_ids: string[];
        projectSize: ProjectSize;
        navigateTo: string;
      }

      const entries: RawEntry[] = [];

      // Medium projects
      (projectsRes.data || []).forEach(p => {
        entries.push({
          id: p.id,
          name: p.name,
          status: p.status,
          booking_ids: p.booking_id ? [p.booking_id] : [],
          projectSize: 'medium',
          navigateTo: `/project/${p.id}`,
        });
      });

      // Small projects (jobs)
      (jobsRes.data || []).forEach(j => {
        entries.push({
          id: j.id,
          name: j.name,
          status: j.status === 'planned' ? 'planning' : j.status,
          booking_ids: j.booking_id ? [j.booking_id] : [],
          projectSize: 'small',
          navigateTo: `/jobs/${j.id}`,
        });
      });

      // Large projects (can have multiple bookings)
      (largeRes.data || []).forEach((lp: any) => {
        const bIds = (lp.large_project_bookings || []).map((b: any) => b.booking_id).filter(Boolean);
        entries.push({
          id: lp.id,
          name: lp.name,
          status: lp.status,
          booking_ids: bIds,
          projectSize: 'large',
          navigateTo: `/large-project/${lp.id}`,
        });
      });

      if (!entries.length) return [];

      // Collect all unique booking IDs
      const allBookingIds = [...new Set(entries.flatMap(e => e.booking_ids))];

      // Fetch job dates and created_at from bookings
      let eventdateMap: Record<string, string | null> = {};
      let rigdayMap: Record<string, string | null> = {};
      let rigdownMap: Record<string, string | null> = {};
      let createdAtMap: Record<string, string | null> = {};
      const [bookings, multiBatchData] = await loadOverviewSources(
        async () => {
          const chunks = [];
          for (let i = 0; i < allBookingIds.length; i += 200) {
            chunks.push(allBookingIds.slice(i, i + 200));
          }
          const results = await Promise.all(chunks.map(async ids => {
            const { data, error } = await supabase
              .from('bookings')
              .select('id, eventdate, rigdaydate, rigdowndate, created_at')
              .eq('organization_id', organizationId)
              .in('id', ids);
            if (error) throw error;
            return data ?? [];
          }));
          return results.flat();
        },
        async (): Promise<Record<string, BatchEconomyData>> => {
          if (!allBookingIds.length) return {};
          return fetchAllEconomyDataMulti(allBookingIds);
        },
      );
          bookings.forEach(b => {
            eventdateMap[b.id] = b.eventdate;
            rigdayMap[b.id] = (b as any).rigdaydate ?? null;
            rigdownMap[b.id] = (b as any).rigdowndate ?? null;
            createdAtMap[b.id] = b.created_at;
          });

      return entries.map((entry) => {
        // For projects with a single booking
        const primaryBookingId = entry.booking_ids[0] ?? null;
        const eventdate = primaryBookingId ? (eventdateMap[primaryBookingId] ?? null) : null;
        const bookingCreatedAt = primaryBookingId ? (createdAtMap[primaryBookingId] ?? null) : null;
        // Stora projekt: tidigaste riggdag och SENASTE nedriggdag över alla bokningar
        const rigCandidates = entry.booking_ids
          .map(id => rigdayMap[id])
          .filter((v): v is string => !!v);
        const rigdownCandidates = entry.booking_ids
          .map(id => rigdownMap[id])
          .filter((v): v is string => !!v);
        const rigdaydate = rigCandidates.length
          ? rigCandidates.reduce((min, v) => (v < min ? v : min))
          : null;
        const rigdowndate = rigdownCandidates.length
          ? rigdownCandidates.reduce((max, v) => (v > max ? v : max))
          : null;

        const batches = entry.booking_ids.map(id => multiBatchData[id]);
        const result = summarizeEconomyBatches(batches);
        return {
          id: entry.id, name: entry.name, status: entry.status,
          booking_id: primaryBookingId, booking_ids: entry.booking_ids,
          eventdate, rigdaydate, rigdowndate, bookingCreatedAt,
          ...result, economyClosed: result.economyClosed || entry.status === 'completed',
          projectSize: entry.projectSize, navigateTo: entry.navigateTo,
          economyBatches: Object.fromEntries(entry.booking_ids.map(id => [id, multiBatchData[id]])),
          revenueAvailable: entry.booking_ids.length > 0,
        };
      });
    },
    staleTime: 10 * 60 * 1000, // 10 min — matches server cache TTL
    gcTime: 30 * 60 * 1000, // 30 min — keep in memory across navigations
    retry: 2,
    retryDelay: 2000,
  });
};