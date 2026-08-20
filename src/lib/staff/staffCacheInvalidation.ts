import type { QueryClient } from '@tanstack/react-query';

/**
 * Central invalidering av all personal-relaterad klientcache.
 *
 * Problem: när personal inaktiveras eller taggar ändras uppdaterades bara den
 * lokala listan (`refetch()`), medan alla andra vyer (kalendrar, lagervyer,
 * dashboards, tillgänglighet) låg kvar på gammal cache — ändringen såg ut att
 * inte ha gått igenom.
 *
 * Lösning: matcha brett på query-nycklar som handlar om personal och
 * invalidera + refetcha aktiva queries direkt.
 */

const STAFF_KEY_PATTERNS = [
  'staff',
  'personal',
  'crew',
  'team',
  'availability',
  'resources',
  'warehouse-lager',
  'assignments',
];

export const isStaffRelatedQueryKey = (key: readonly unknown[]): boolean => {
  const flat = key
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part) ?? ''))
    .join('|')
    .toLowerCase();
  return STAFF_KEY_PATTERNS.some((pattern) => flat.includes(pattern));
};

export const invalidateStaffCaches = async (queryClient: QueryClient): Promise<void> => {
  await queryClient.invalidateQueries({
    predicate: (query) => isStaffRelatedQueryKey(query.queryKey as readonly unknown[]),
    refetchType: 'active',
  });
};
