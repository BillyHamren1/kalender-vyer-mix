import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useWarehouseStaffActivations, type WarehouseStaffMember } from './useWarehouseStaffActivations';
import { useWarehouseStaffScheduleOverview } from './useWarehouseStaffScheduleOverview';

export interface WarehouseTimelineAssignment {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  resourceId: string;
  resourceLabel: string;
  bookingId: string | null;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  packingProjectId: string | null;
}

export interface WarehouseTimelineStaff {
  id: string;
  name: string;
  isCurrentlyActive: boolean;
  status: 'available' | 'assigned' | 'off_duty';
  teamId: string | null;
  teamName: string | null;
  assignments: WarehouseTimelineAssignment[];
  hasConflict: boolean;
  currentJob: WarehouseTimelineAssignment | null;
  nextJob: WarehouseTimelineAssignment | null;
}

const teamLabel = (teamId: string) => {
  if (teamId.startsWith('lager-')) return `Lager ${teamId.replace('lager-', '')}`;
  if (teamId.startsWith('team-')) return `Team ${teamId.replace('team-', '')}`;
  return teamId;
};

const overlaps = (a: WarehouseTimelineAssignment, b: WarehouseTimelineAssignment): boolean => {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  const aStart = new Date(a.startTime).getTime();
  const aEnd = new Date(a.endTime).getTime();
  const bStart = new Date(b.startTime).getTime();
  const bEnd = new Date(b.endTime).getTime();
  return aStart < bEnd && bStart < aEnd;
};

export function useWarehouseStaffTimeline(date: Date) {
  const { staffWithActivations, isLoading: isLoadingStaff } = useWarehouseStaffActivations();
  const { data: scheduleGroups = [], isLoading: isLoadingSchedule } =
    useWarehouseStaffScheduleOverview(staffWithActivations, date, 'day');

  const dateKey = format(date, 'yyyy-MM-dd');
  const staffIds = staffWithActivations.map((s) => s.id);

  // Fetch primary "lager-*" team assignment for the day per staff
  const { data: teamMap = new Map<string, string>(), isLoading: isLoadingTeams } = useQuery({
    queryKey: ['warehouse-timeline-teams', dateKey, staffIds.join(',')],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('staff_id, team_id')
        .in('staff_id', staffIds)
        .eq('assignment_date', dateKey)
        .like('team_id', 'lager-%');
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((row: any) => {
        if (!map.has(row.staff_id)) map.set(row.staff_id, row.team_id);
      });
      return map;
    },
  });

  // Fetch packing project ids for all booking_ids referenced in schedule (for navigation)
  const bookingIds = useMemo(() => {
    const set = new Set<string>();
    scheduleGroups.forEach((g) =>
      g.items.forEach((i) => {
        if (i.bookingId) set.add(i.bookingId);
      }),
    );
    return Array.from(set);
  }, [scheduleGroups]);

  const { data: packingByBooking = new Map<string, string>() } = useQuery({
    queryKey: ['warehouse-timeline-packing', bookingIds.join(',')],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, booking_id')
        .in('booking_id', bookingIds);
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((row: any) => {
        if (row.booking_id && !map.has(row.booking_id)) map.set(row.booking_id, row.id);
      });
      return map;
    },
  });

  const timeline: WarehouseTimelineStaff[] = useMemo(() => {
    return staffWithActivations.map((staff: WarehouseStaffMember) => {
      const group = scheduleGroups.find((g) => g.staff.id === staff.id);
      const items = group?.items || [];

      const assignments: WarehouseTimelineAssignment[] = items.map((it) => ({
        id: it.id,
        title: it.title,
        startTime: it.startTime,
        endTime: it.endTime,
        eventType: it.eventType ?? null,
        resourceId: it.resourceId,
        resourceLabel: it.resourceLabel,
        bookingId: it.bookingId ?? null,
        bookingNumber: it.bookingNumber ?? null,
        deliveryAddress: it.deliveryAddress ?? null,
        packingProjectId: it.bookingId ? packingByBooking.get(it.bookingId) ?? null : null,
      }));

      // Conflict detection
      let hasConflict = false;
      for (let i = 0; i < assignments.length && !hasConflict; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          if (overlaps(assignments[i], assignments[j])) {
            hasConflict = true;
            break;
          }
        }
      }

      // Current / next
      const now = Date.now();
      let currentJob: WarehouseTimelineAssignment | null = null;
      let nextJob: WarehouseTimelineAssignment | null = null;
      const sorted = [...assignments].sort((a, b) => {
        const at = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bt = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        return at - bt;
      });
      for (const a of sorted) {
        if (a.startTime && a.endTime) {
          const s = new Date(a.startTime).getTime();
          const e = new Date(a.endTime).getTime();
          if (s <= now && e >= now) {
            currentJob = a;
          } else if (s > now && !nextJob) {
            nextJob = a;
          }
        }
      }

      const teamId = teamMap.get(staff.id) || null;
      const teamName = teamId ? teamLabel(teamId) : null;

      let status: WarehouseTimelineStaff['status'] = 'off_duty';
      if (staff.isCurrentlyActive) {
        status = assignments.length > 0 ? 'assigned' : 'available';
      } else if (assignments.length > 0) {
        status = 'assigned';
      }

      return {
        id: staff.id,
        name: staff.name,
        isCurrentlyActive: staff.isCurrentlyActive,
        status,
        teamId,
        teamName,
        assignments,
        hasConflict,
        currentJob,
        nextJob,
      };
    });
  }, [staffWithActivations, scheduleGroups, teamMap, packingByBooking]);

  return {
    timeline,
    isLoading: isLoadingStaff || isLoadingSchedule || isLoadingTeams,
  };
}
