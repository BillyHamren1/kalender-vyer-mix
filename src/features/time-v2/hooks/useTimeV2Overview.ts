import { useQuery } from '@tanstack/react-query';
import { fetchTimeV2Overview, getTimeV2BaseUrl, TimeV2ClientError } from '@/features/time-v2/lib/client';
import type { TimeV2Overview } from '@/features/time-v2/lib/contract';

export function useTimeV2Overview(organizationId: string | null, enabled: boolean) {
  const baseUrl = getTimeV2BaseUrl();

  return useQuery<TimeV2Overview, TimeV2ClientError>({
    queryKey: ['time-v2', 'overview', organizationId, baseUrl],
    queryFn: () => fetchTimeV2Overview(organizationId as string),
    enabled: enabled && !!organizationId,
    retry: (count, error) => (error instanceof TimeV2ClientError && error.kind === 'not_configured' ? false : count < 1),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
