import { useQuery } from '@tanstack/react-query';
import { fetchMyProjects, MyProjectItem } from '@/services/myProjectsService';

export interface MySidebarProject {
  id: string;
  name: string;
  type: 'standard' | 'large';
  role: 'leader' | 'assigned' | 'follower';
  nextDeadline: string | null;
  eventDate: string | null;
  overdue: boolean;
  href: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const sortKey = (p: MyProjectItem): string => {
  // Använd nextDeadline om finns, annars eventDate; saknas båda → sist
  const d = p.nextDeadline || p.eventDate;
  return d ? d.slice(0, 10) : '9999-12-31';
};

/**
 * Lättviktig hook för sidebar — returnerar de 8 första projekten,
 * sorterade på närmaste deadline/datum.
 * staleTime 60s för att inte göra sidebar seg.
 */
export const useMySidebarProjects = (staffId: string | null) => {
  return useQuery({
    queryKey: ['my-sidebar-projects', staffId],
    enabled: !!staffId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async (): Promise<{ items: MySidebarProject[]; total: number }> => {
      if (!staffId) return { items: [], total: 0 };
      const all = await fetchMyProjects(staffId);
      const today = todayIso();

      const sorted = [...all].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

      const items: MySidebarProject[] = sorted.slice(0, 8).map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        role: p.role,
        nextDeadline: p.nextDeadline,
        eventDate: p.eventDate,
        overdue: !!p.nextDeadline && p.nextDeadline.slice(0, 10) < today,
        href: p.type === 'large' ? `/large-project/${p.id}` : `/project/${p.id}`,
      }));

      return { items, total: all.length };
    },
  });
};
