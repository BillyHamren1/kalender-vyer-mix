export const ORG = '11111111-1111-4111-8111-111111111111';
export const ITEM = '22222222-2222-4222-8222-222222222222';
export const INSTANCE = '33333333-3333-4333-8333-333333333333';

const rack = (id: string, name: string, x: number) => ({
  id, name, color: '#C77922', geometry: { xM: x, yM: 2, widthM: 4, depthM: 1 },
  storage: { version: 1, status: 'verified', bays: [
    { id: `${id}-b1`, label: 'A', levels: [{ level: 1, positions: 2, depths: 1 }, { level: 2, positions: 2, depths: 1 }, { level: 3, positions: 2, depths: 1 }] },
  ] },
});

export function articleFixture(opts: { instanceId?: string | null } = {}): any {
  const instanceId = opts.instanceId ?? null;
  return {
    schema: 'warehouse-article-locations.v1',
    organizationId: ORG, itemTypeId: ITEM, instanceId,
    article: { name: 'Uniflex Glasvägg', sku: 'UGV-1' },
    status: 'PLACED',
    placements: [
      { palletId: 'p1', palletCode: 'PAL-1', palletName: 'Pall 1', quantity: 10, instanceId, state: 'EXACT',
        slot: { mapId: 'm1', rackId: 'r1', bayId: 'r1-b1', level: 1, position: 1, depth: 1 }, address: 'H1-R1-A-1', rackName: 'R1', bayLabel: 'A' },
      { palletId: 'p2', palletCode: 'PAL-2', palletName: 'Pall 2', quantity: 4, instanceId, state: 'EXACT',
        slot: { mapId: 'm2', rackId: 'r9', bayId: 'r9-b1', level: 3, position: 2, depth: 1 }, address: 'H2-R9-A-3', rackName: 'R9', bayLabel: 'A' },
    ],
    maps: [
      { id: 'm1', name: 'Hall 1', hall: { widthM: 30, depthM: 20 }, racks: [rack('r1', 'R1', 2), rack('r2', 'R2', 8)],
        areas: [{ id: 'a1', name: 'Utlastning', geometry: { xM: 20, yM: 10, widthM: 5, depthM: 5 } }],
        portals: [{ id: 'g1', name: 'Port 1', xM: 0, yM: 5, widthM: 3, axis: 'y' }] },
      { id: 'm2', name: 'Hall 2', hall: { widthM: 20, depthM: 10 }, racks: [rack('r9', 'R9', 1)], areas: [], portals: [] },
    ],
    serverTimestamp: '2026-10-08T12:00:00.000Z',
  };
}
