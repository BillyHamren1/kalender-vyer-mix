/**
 * useLargeProjectPlannerItems
 * --------------------------------------------------------------------------
 * React Query-hook för intern bokningsplanering i ett stort projekt.
 * Wrappar largeProjectPlannerService. Skriver ENDAST till
 * `large_project_booking_plan_items`.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLargeProjectPlannerItem,
  createPlannerItemsFromProjectBookings,
  deleteLargeProjectPlannerItem,
  fetchLargeProjectPlannerContext,
  splitBookingIntoPlannerTasks,
  updateLargeProjectPlannerItem,
} from './largeProjectPlannerService';
import type {
  CreatePlannerItemInput,
  LargeProjectBookingPlanItem,
  LargeProjectPlannerContext,
  LargeProjectPlannerStaffMember,
  LargeProjectPlannerTeam,
  SplitBookingInput,
  UpdatePlannerItemInput,
} from './largeProjectPlannerTypes';

const queryKeyFor = (largeProjectId: string | null | undefined) =>
  ['large-project-planner', largeProjectId ?? 'none'] as const;

export interface PlannerItemWithValidity extends LargeProjectBookingPlanItem {
  isAssignedStaffAllowed: boolean;
  assignmentWarning: string | null;
}

export function useLargeProjectPlannerItems(largeProjectId: string | null | undefined) {
  const qc = useQueryClient();
  const enabled = !!largeProjectId;

  const query = useQuery<LargeProjectPlannerContext>({
    queryKey: queryKeyFor(largeProjectId),
    queryFn: () => fetchLargeProjectPlannerContext(largeProjectId as string),
    enabled,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeyFor(largeProjectId) });
  }, [qc, largeProjectId]);

  const createMutation = useMutation({
    mutationFn: (input: CreatePlannerItemInput) => createLargeProjectPlannerItem(input),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdatePlannerItemInput }) =>
      updateLargeProjectPlannerItem(id, updates),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLargeProjectPlannerItem(id),
    onSuccess: invalidate,
  });

  const splitMutation = useMutation({
    mutationFn: (input: SplitBookingInput) => splitBookingIntoPlannerTasks(input),
    onSuccess: invalidate,
  });

  const seedMutation = useMutation({
    mutationFn: () => {
      if (!largeProjectId) throw new Error('largeProjectId saknas');
      return createPlannerItemsFromProjectBookings(largeProjectId);
    },
    onSuccess: invalidate,
  });

  const context = query.data;
  const staffByDay = context?.staffByDay ?? {};
  const teamsByDay = context?.teamsByDay ?? {};
  const items = context?.items ?? [];

  const allowedStaffByDate = staffByDay;

  const getAllowedStaffForDate = useCallback(
    (date: string | null | undefined): LargeProjectPlannerStaffMember[] => {
      if (!date) return [];
      return allowedStaffByDate[date] ?? [];
    },
    [allowedStaffByDate],
  );

  const isStaffAllowedForDate = useCallback(
    (staffId: string | null | undefined, date: string | null | undefined): boolean => {
      if (!staffId || !date) return false;
      const list = allowedStaffByDate[date];
      if (!list) return false;
      return list.some((s) => s.id === staffId);
    },
    [allowedStaffByDate],
  );

  const getTeamsForDate = useCallback(
    (date: string | null | undefined): LargeProjectPlannerTeam[] => {
      if (!date) return [];
      return teamsByDay[date] ?? [];
    },
    [teamsByDay],
  );

  const isTeamAllowedForDate = useCallback(
    (teamId: string | null | undefined, date: string | null | undefined): boolean => {
      if (!teamId || !date) return false;
      const list = teamsByDay[date];
      if (!list) return false;
      return list.some((t) => t.teamId === teamId);
    },
    [teamsByDay],
  );

  const itemsWithAssignmentValidity = useMemo<PlannerItemWithValidity[]>(() => {
    return items.map((it) => {
      // Primärt valideras team (projektkalenderns kolumner).
      if (it.assigned_team_id) {
        const allowed = isTeamAllowedForDate(it.assigned_team_id, it.plan_date);
        return {
          ...it,
          isAssignedStaffAllowed: allowed,
          assignmentWarning: allowed
            ? null
            : 'Teamet är inte bemannat på projektet den här dagen.',
        };
      }
      if (!it.assigned_staff_id) {
        return { ...it, isAssignedStaffAllowed: true, assignmentWarning: null };
      }
      const allowed = isStaffAllowedForDate(it.assigned_staff_id, it.plan_date);
      return {
        ...it,
        isAssignedStaffAllowed: allowed,
        assignmentWarning: allowed
          ? null
          : 'Personen är inte bemannad på projektet den här dagen.',
      };
    });
  }, [items, isStaffAllowedForDate, isTeamAllowedForDate]);

  return useMemo(
    () => ({
      isLoading: query.isLoading,
      error: (query.error as Error | null) ?? null,
      project: context ? { id: context.projectId } : null,
      bookings: context?.bookings ?? [],
      staff: context?.staff ?? [],
      staffByDay,
      teamsByDay,
      allowedStaffByDate,
      getAllowedStaffForDate,
      isStaffAllowedForDate,
      getTeamsForDate,
      isTeamAllowedForDate,
      items,
      itemsWithAssignmentValidity,
      days: context?.days ?? [],
      refetch: query.refetch,
      createItem: createMutation.mutateAsync,
      updateItem: (id: string, updates: UpdatePlannerItemInput) =>
        updateMutation.mutateAsync({ id, updates }),
      deleteItem: deleteMutation.mutateAsync,
      splitBooking: splitMutation.mutateAsync,
      createItemsFromBookings: seedMutation.mutateAsync,
      isMutating:
        createMutation.isPending ||
        updateMutation.isPending ||
        deleteMutation.isPending ||
        splitMutation.isPending ||
        seedMutation.isPending,
    }),
    [
      query.isLoading,
      query.error,
      query.refetch,
      context,
      staffByDay,
      allowedStaffByDate,
      getAllowedStaffForDate,
      isStaffAllowedForDate,
      items,
      itemsWithAssignmentValidity,
      createMutation.mutateAsync,
      createMutation.isPending,
      updateMutation.mutateAsync,
      updateMutation.isPending,
      deleteMutation.mutateAsync,
      deleteMutation.isPending,
      splitMutation.mutateAsync,
      splitMutation.isPending,
      seedMutation.mutateAsync,
      seedMutation.isPending,
    ],
  );
}

export type UseLargeProjectPlannerItemsReturn = ReturnType<typeof useLargeProjectPlannerItems>;
