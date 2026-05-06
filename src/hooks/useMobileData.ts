import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi, MobileBooking, MobileTimeReport, MobilePurchase, MobileTravelLog } from '@/services/mobileApiService';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export function useMobileBookings() {
  return useQuery({
    queryKey: ['mobile-bookings'],
    queryFn: async () => {
      const r = await mobileApi.getBookings();
      const bookings = r.bookings || [];
      // Lager-flow debug: log every Lager pass we receive on the client.
      try {
        const lagerBookings = bookings.filter(
          (b: any) =>
            b?.is_internal &&
            (b?.internal_type === 'lager' || /lager/i.test(b?.client || '')),
        );
        for (const lb of lagerBookings) {
          const dates: string[] = Array.isArray((lb as any).assignment_dates)
            ? (lb as any).assignment_dates
            : [];
          console.log('[mobile-bookings][lager] received', {
            booking_id: (lb as any).id,
            client: (lb as any).client,
            dates,
            dateCount: dates.length,
          });
        }
      } catch (e) {
        console.warn('[mobile-bookings][lager] log failed', e);
      }
      return bookings;
    },
    staleTime: STALE_TIME,
  });
}

export function useMobileTimeReports() {
  return useQuery({
    queryKey: ['mobile-time-reports'],
    queryFn: () => mobileApi.getTimeReports().then(r => r.time_reports),
    staleTime: STALE_TIME,
  });
}

export function useMobileBookingDetails(id: string | undefined) {
  return useQuery({
    queryKey: ['mobile-booking-details', id],
    queryFn: () => mobileApi.getBookingDetails(id!),
    staleTime: STALE_TIME,
    enabled: !!id,
  });
}

export function useMobileBookingPurchases(bookings: MobileBooking[]) {
  return useQuery({
    queryKey: ['mobile-purchases', bookings.map(b => b.id).sort().join(',')],
    queryFn: async () => {
      const allResults = await Promise.allSettled(
        bookings.map(b =>
          mobileApi.getProjectPurchases(b.id).then(r =>
            (r.purchases || []).map(p => ({ ...p, booking_client: b.client }))
          )
        )
      );
      return allResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => (r as PromiseFulfilledResult<(MobilePurchase & { booking_client?: string })[]>).value)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    staleTime: STALE_TIME,
    enabled: bookings.length > 0,
  });
}

export function useMobileTravelLogs() {
  return useQuery({
    queryKey: ['mobile-travel-logs'],
    queryFn: () => mobileApi.getTravelLogs().then(r => r.travel_logs),
    staleTime: STALE_TIME,
  });
}

/**
 * Workdays för mobilens dagskort. Defaultar 14 dagar bakåt.
 * Workdayn är dagens totala arbetstid och DEN viktiga raden — alla
 * day-status/badges utgår från denna. Oallokerad tid är OK.
 */
export function useMobileWorkdays(days = 14) {
  return useQuery({
    queryKey: ['mobile-workdays-review', days],
    queryFn: () => mobileApi.listWorkdaysReview({ days }).then(r => r.workdays),
    staleTime: STALE_TIME,
  });
}

export function useInvalidateMobileData() {
  const queryClient = useQueryClient();
  return {
    invalidateTimeReports: () => queryClient.invalidateQueries({ queryKey: ['mobile-time-reports'] }),
    invalidateBookings: () => queryClient.invalidateQueries({ queryKey: ['mobile-bookings'] }),
    invalidatePurchases: () => queryClient.invalidateQueries({ queryKey: ['mobile-purchases'] }),
    invalidateTravelLogs: () => queryClient.invalidateQueries({ queryKey: ['mobile-travel-logs'] }),
    invalidateBookingDetails: (id?: string) => 
      queryClient.invalidateQueries({ queryKey: id ? ['mobile-booking-details', id] : ['mobile-booking-details'] }),
  };
}
