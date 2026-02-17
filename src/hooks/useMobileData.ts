import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi, MobileBooking, MobileTimeReport, MobilePurchase } from '@/services/mobileApiService';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export function useMobileBookings() {
  return useQuery({
    queryKey: ['mobile-bookings'],
    queryFn: () => mobileApi.getBookings().then(r => r.bookings),
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

export function useInvalidateMobileData() {
  const queryClient = useQueryClient();
  return {
    invalidateTimeReports: () => queryClient.invalidateQueries({ queryKey: ['mobile-time-reports'] }),
    invalidateBookings: () => queryClient.invalidateQueries({ queryKey: ['mobile-bookings'] }),
    invalidatePurchases: () => queryClient.invalidateQueries({ queryKey: ['mobile-purchases'] }),
    invalidateBookingDetails: (id?: string) => 
      queryClient.invalidateQueries({ queryKey: id ? ['mobile-booking-details', id] : ['mobile-booking-details'] }),
  };
}
