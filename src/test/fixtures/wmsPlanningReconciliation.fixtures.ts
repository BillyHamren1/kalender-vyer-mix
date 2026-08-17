/**
 * SCANNER HARDENING – STEG 14: test-fixtures, en per mismatch-typ.
 */

import type { ReconciliationInput } from '@/lib/scanner/reconciliation';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

const base = (): ReconciliationInput => ({
  organizationId: ORG,
  wmsItems: [],
  wmsAllocations: [],
  planningItems: [],
  committedOperations: [],
});

const wmsItem = (over: Partial<ReconciliationInput['wmsItems'][number]> = {}) => ({
  organizationId: ORG,
  bookingId: 'bk-1',
  reservationLineId: 'line-1',
  itemId: 'item-1',
  packedQuantity: 2,
  requiredQuantity: 5,
  ...over,
});

const planItem = (over: Partial<ReconciliationInput['planningItems'][number]> = {}) => ({
  organizationId: ORG,
  bookingId: 'bk-1',
  reservationLineId: 'line-1',
  itemId: 'item-1',
  packedQuantity: 2,
  requiredQuantity: 5,
  allocatedInstanceIds: [] as string[],
  ...over,
});

const alloc = (over: Partial<ReconciliationInput['wmsAllocations'][number]> = {}) => ({
  organizationId: ORG,
  bookingId: 'bk-1',
  reservationLineId: 'line-1',
  itemId: 'item-1',
  itemInstanceId: 'inst-1',
  active: true,
  ...over,
});

/** Ren, matchande värld. Ska ge noll findings. */
export const cleanFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem()],
  planningItems: [planItem({ allocatedInstanceIds: ['inst-1'] })],
  wmsAllocations: [alloc()],
});

/** 1. WMS packed ≠ Planning projected. */
export const quantityMismatchFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem({ packedQuantity: 3 })],
  planningItems: [planItem({ packedQuantity: 1 })],
});

/** 2. WMS allocation finns men Planning projection saknas. */
export const allocationWithoutProjectionFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem()],
  planningItems: [planItem({ allocatedInstanceIds: [] })],
  wmsAllocations: [alloc()],
});

/** 3. Planning säger packed men WMS canonical state saknas. */
export const planningPackedWithoutWmsFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [],
  planningItems: [planItem({ packedQuantity: 4 })],
});

/** 4. Samma instans aktivt allokerad till flera reservationsrader. */
export const instanceDoubleAllocationFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem(), wmsItem({ bookingId: 'bk-2', reservationLineId: 'line-2' })],
  planningItems: [
    planItem({ allocatedInstanceIds: ['inst-1'] }),
    planItem({ bookingId: 'bk-2', reservationLineId: 'line-2', allocatedInstanceIds: ['inst-1'] }),
  ],
  wmsAllocations: [
    alloc(),
    alloc({ bookingId: 'bk-2', reservationLineId: 'line-2' }),
  ],
});

/** 5. Allocation på fel organisation. */
export const wrongOrganizationFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem()],
  planningItems: [planItem({ allocatedInstanceIds: ['inst-1'] })],
  wmsAllocations: [alloc({ organizationId: OTHER_ORG })],
});

/** 6. Packed quantity > required quantity. */
export const packedExceedsRequiredFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem({ packedQuantity: 7, requiredQuantity: 5 })],
  planningItems: [planItem({ packedQuantity: 7, requiredQuantity: 5 })],
});

/** 7. Orphan allocation (ingen canonical reservationsrad). */
export const orphanAllocationFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [],
  planningItems: [],
  wmsAllocations: [alloc({ itemInstanceId: 'inst-orphan' })],
});

/** 8. Committed scanner-operation utan canonical effekt. */
export const committedWithoutEffectFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem({ packedQuantity: 2 })],
  planningItems: [planItem({ packedQuantity: 2 })],
  committedOperations: [
    {
      operationId: 'op-1',
      organizationId: ORG,
      bookingId: 'bk-1',
      reservationLineId: 'line-1',
      itemId: 'item-1',
      itemInstanceId: 'inst-1',
      expectedPackedQuantity: 3,
    },
  ],
});

/** 9. Planning-local allokering utan WMS truth. */
export const planningLocalAllocationFixture = (): ReconciliationInput => ({
  ...base(),
  wmsItems: [wmsItem()],
  planningItems: [planItem({ allocatedInstanceIds: ['inst-ghost'] })],
  wmsAllocations: [],
});
