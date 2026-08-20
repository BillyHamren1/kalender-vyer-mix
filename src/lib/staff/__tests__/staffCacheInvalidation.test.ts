import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { isStaffRelatedQueryKey, invalidateStaffCaches } from '../staffCacheInvalidation';

describe('staff cache invalidation', () => {
  it('matchar personal-relaterade nycklar', () => {
    expect(isStaffRelatedQueryKey(['staffMembers'])).toBe(true);
    expect(isStaffRelatedQueryKey(['available-staff-week', 123])).toBe(true);
    expect(isStaffRelatedQueryKey(['warehouse-lager-assigned-staff-by-date'])).toBe(true);
    expect(isStaffRelatedQueryKey(['staff-availability', { tag: 'Lager' }])).toBe(true);
    expect(isStaffRelatedQueryKey(['bookings', 'week'])).toBe(false);
  });

  it('invaliderar staff-queries men lämnar övriga', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['staffMembers'], [{ id: '1' }]);
    qc.setQueryData(['bookings'], [{ id: 'b1' }]);

    await invalidateStaffCaches(qc);

    expect(qc.getQueryState(['staffMembers'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['bookings'])?.isInvalidated).toBe(false);
  });
});
