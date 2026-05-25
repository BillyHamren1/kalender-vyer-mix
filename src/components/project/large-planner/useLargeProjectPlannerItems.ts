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
  LargeProjectPlannerContext,
  SplitBookingInput,
  UpdatePlannerItemInput,
} from './largeProjectPlannerTypes';

const queryKeyFor = (largeProjectId: string | null | undefined) =>
  ['large-project-planner', largeProjectId ?? 'none'] as const;

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

  return useMemo(
    () => ({
      isLoading: query.isLoading,
      error: (query.error as Error | null) ?? null,
      project: context ? { id: context.projectId } : null,
      bookings: context?.bookings ?? [],
      staff: context?.staff ?? [],
      items: context?.items ?? [],
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
