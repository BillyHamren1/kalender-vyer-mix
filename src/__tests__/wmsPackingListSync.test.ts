import { describe, it, expect } from 'vitest';
import {
  flattenWmsPackingLines,
  flattenWmsProjectProducts,
  planWmsPackingSync,
  resolveWmsReservation,
  syncPackingListFromWms,
} from '../../supabase/functions/_shared/wmsPackingList';

const CTX = { packingId: 'pk1', organizationId: 'org1', sourceBookingId: 'booking1', claimUnscopedLegacyRows: true };

const wmsBody = {
  lines: [
    { line_id: 'l1', type: 'item_type', name: 'Vägg 3m', required_qty: 6, sku: 'V3', item_type_id: 'it1' },
    {
      line_id: 'l2',
      type: 'package',
      name: 'Tältpaket',
      quantity: 2,
      components: [
        { item_type_id: 'it2', sku: 'T1', name: 'Tältduk', required_qty: 2 },
        { item_type_id: 'it3', sku: 'T2', name: 'Ben', required_qty: 8 },
      ],
    },
    {
      line_id: 'l2-accessory',
      type: 'item_type',
      name: 'Vikt',
      quantity: 4,
      item_type_id: 'it4',
      is_accessory: true,
      parent_line_id: 'l2',
    },
    { line_id: 'l3', type: 'item_type', name: 'Nollrad', required_qty: 0, sku: 'X', item_type_id: 'it9' },
  ],
};

describe('flattenWmsPackingLines', () => {
  it('plattar ut paket till komponenter och hoppar över paketrubriken', () => {
    const rows = flattenWmsPackingLines(wmsBody);
    expect(rows.map((r) => r.wmsLineId)).toEqual(['l1', 'l2::it2', 'l2::it3', 'l2-accessory']);
    expect(rows[1]).toMatchObject({ name: 'Tältduk', quantity: 2, packageName: 'Tältpaket', relationshipKind: 'package_member', itemTypeId: 'it2' });
    expect(rows[3]).toMatchObject({ name: 'Vikt', packageName: 'Tältpaket', relationshipKind: 'accessory' });
  });

  it('särskiljer komponenter som delar namn med paketet via SKU', () => {
    const rows = flattenWmsPackingLines({
      lines: [{
        line_id: 'p1', type: 'package', name: 'Tält 3x3',
        components: [
          { item_type_id: 'a', sku: 'RAM', name: 'Tält 3x3', required_qty: 1 },
          { item_type_id: 'b', sku: 'DUK', name: 'Tält 3x3', required_qty: 1 },
        ],
      }],
    });
    expect(rows.map((r) => r.name)).toEqual(['Tält 3x3 (RAM)', 'Tält 3x3 (DUK)']);
  });

  it('tar bort rader utan antal', () => {
    expect(flattenWmsPackingLines(wmsBody).some((r) => r.wmsLineId === 'l3')).toBe(false);
  });

  it('är bakåtkompatibel men respekterar WMS packability och arv i paket', () => {
    const rows = flattenWmsPackingLines({
      lines: [
        { line_id: 'legacy', name: 'Äldre rad', quantity: 1 },
        {
          line_id: 'transport', name: 'Transport', quantity: 1,
          product_packable_default: false,
        },
        {
          line_id: 'package', type: 'package', name: 'Paket', quantity: 1,
          booking_packability_override: false,
          packability_revision: 7,
          components: [{ item_type_id: 'part', name: 'Paketdel', quantity: 1 }],
        },
      ],
    });
    expect(rows[0]).toMatchObject({ isPackable: true, packabilitySource: 'product_default', packabilityRevision: 1 });
    expect(rows[1]).toMatchObject({ productPackableDefault: false, isPackable: false, packabilitySource: 'product_default' });
    expect(rows[2]).toMatchObject({ bookingPackabilityOverride: false, isPackable: false, packabilitySource: 'booking_override', packabilityRevision: 7 });
  });
});


describe('flattenWmsProjectProducts', () => {
  it('bevarar WMS-ordning och kopplar tillbehör samt paketdelar till rätt paket', () => {
    const rows = flattenWmsProjectProducts(wmsBody);
    expect(rows.map((r) => r.syncKey)).toEqual([
      'wms:l1',
      'wms:l2',
      'wms:l2-accessory',
      'wms:l2::it2',
      'wms:l2::it3',
    ]);
    expect(rows[1]).toMatchObject({ name: 'Tältpaket', quantity: 2 });
    expect(rows[2]).toMatchObject({
      name: 'Vikt',
      parentSyncKey: 'wms:l2',
      isPackageComponent: false,
      sortIndex: 2,
    });
    expect(rows[3]).toMatchObject({
      name: 'Tältduk',
      parentSyncKey: 'wms:l2',
      isPackageComponent: true,
      sortIndex: 3,
    });
  });

  it('numrerar upprepade paket utan att slå ihop deras barn', () => {
    const rows = flattenWmsProjectProducts({
      lines: [
        { line_id: 'p1', type: 'package', package_id: 'pkg', name: 'Tält', quantity: 1 },
        { line_id: 'a1', type: 'item_type', name: 'Vikt', quantity: 4, is_accessory: true, parent_line_id: 'p1' },
        { line_id: 'p2', type: 'package', package_id: 'pkg', name: 'Tält', quantity: 1 },
        { line_id: 'a2', type: 'item_type', name: 'Vikt', quantity: 4, is_accessory: true, parent_line_id: 'p2' },
      ],
    });

    expect(rows.map((r) => r.name)).toEqual(['Tält (#1)', 'Vikt', 'Tält (#2)', 'Vikt']);
    expect(rows[1].parentSyncKey).toBe('wms:p1');
    expect(rows[3].parentSyncKey).toBe('wms:p2');
  });

  it('använder WMS-lagrad källordning och visningsnamn oberoende av API-radordning', () => {
    const rows = flattenWmsProjectProducts({
      lines: [
        {
          line_id: 'a2', type: 'item_type', name: 'Vikt från katalog', quantity: 4,
          is_accessory: true, parent_line_id: 'p2', source_sort_index: 3,
          source_display_name: 'H MT Vikt',
        },
        {
          line_id: 'p2', type: 'package', package_id: 'pkg', name: 'Tält', quantity: 1,
          source_sort_index: 2, source_display_name: 'H Mastertent - Squaretent 3x3 (#2)',
        },
        {
          line_id: 'p1', type: 'package', package_id: 'pkg', name: 'Tält', quantity: 1,
          source_sort_index: 0, source_display_name: 'H Mastertent - Squaretent 3x3 (#1)',
        },
        {
          line_id: 'a1', type: 'item_type', name: 'Vikt från katalog', quantity: 4,
          is_accessory: true, parent_line_id: 'p1', source_sort_index: 1,
          source_display_name: 'H MT Vikt',
        },
      ],
    });

    expect(rows.map((row) => row.name)).toEqual([
      'H Mastertent - Squaretent 3x3 (#1)',
      'H MT Vikt',
      'H Mastertent - Squaretent 3x3 (#2)',
      'H MT Vikt',
    ]);
    expect(rows[1].parentSyncKey).toBe('wms:p1');
    expect(rows[3].parentSyncKey).toBe('wms:p2');
  });
});

describe('planWmsPackingSync', () => {
  it('skapar rader första gången med WMS-identitet', () => {
    const plan = planWmsPackingSync(flattenWmsPackingLines(wmsBody), [], CTX);
    expect(plan.inserts).toHaveLength(4);
    expect(plan.inserts[0]).toMatchObject({
      packing_id: 'pk1',
      organization_id: 'org1',
      wms_line_id: 'l1',
      manual_name: 'Vägg 3m',
      quantity_to_pack: 6,
      wms_item_type_id: 'it1',
      wms_sku: 'V3',
      booking_product_id: null,
    });
  });

  it('är idempotent — andra körningen ändrar ingenting', () => {
    const rows = flattenWmsPackingLines(wmsBody);
    const existing = planWmsPackingSync(rows, [], CTX).inserts.map((i: any, idx) => ({
      id: `row${idx}`,
      wms_line_id: i.wms_line_id,
      quantity_to_pack: i.quantity_to_pack,
      quantity_packed: 0,
      manual_name: i.manual_name,
      notes: i.notes,
      excluded: false,
    }));
    const plan = planWmsPackingSync(rows, existing, CTX);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.staleIds).toHaveLength(0);
  });

  it('uppdaterar antal men aldrig under redan packat antal', () => {
    const rows = flattenWmsPackingLines(wmsBody);
    const plan = planWmsPackingSync(rows, [
      { id: 'a', wms_line_id: 'l1', quantity_to_pack: 4, quantity_packed: 0, manual_name: 'Vägg 3m', excluded: false },
      { id: 'b', wms_line_id: 'l2::it2', quantity_to_pack: 5, quantity_packed: 5, manual_name: 'Tältduk', excluded: false },
      { id: 'c', wms_line_id: 'l2::it3', quantity_to_pack: 8, quantity_packed: 0, manual_name: 'Ben', excluded: false },
    ], CTX);
    expect(plan.updates).toEqual([
      { id: 'a', patch: { quantity_to_pack: 6 } },
      { id: 'b', patch: { notes: 'Paketmedlem i: Tältpaket' } },
      { id: 'c', patch: { notes: 'Paketmedlem i: Tältpaket' } },
    ]);
  });

  it('retires unscoped legacy rows on cutover and flags packed rows as conflicts', () => {
    const plan = planWmsPackingSync(flattenWmsPackingLines(wmsBody), [
      { id: 'legacy', wms_line_id: null, booking_product_id: 'old', quantity_to_pack: 1, quantity_packed: 0, manual_name: 'Gammal rad', excluded: false },
    ], CTX);
    expect(plan.staleIds).toEqual(['legacy']);
  });

  it('markerar borttagna rader som exkluderade, aldrig raderade, och flaggar packade som konflikt', () => {
    const rows = flattenWmsPackingLines(wmsBody);
    const plan = planWmsPackingSync(rows, [
      { id: 'gone', wms_line_id: 'lX', quantity_to_pack: 1, quantity_packed: 0, manual_name: 'Borta', excluded: false },
      { id: 'packed', wms_line_id: 'lY', quantity_to_pack: 1, quantity_packed: 1, manual_name: 'Packad', excluded: false },
    ], CTX);
    expect(plan.staleIds).toEqual(['gone']);
    expect(plan.conflictIds).toEqual(['packed']);
  });

  it('bevarar Lager-override över ny Booking/default-projektion', () => {
    const rows = flattenWmsPackingLines({
      lines: [{
        line_id: 'l1', name: 'Transport', quantity: 1,
        product_packable_default: false,
        booking_packability_override: false,
        is_packable: false,
        packability_revision: 2,
      }],
    });
    const plan = planWmsPackingSync(rows, [{
      id: 'row1', wms_line_id: 'l1', quantity_to_pack: 1, quantity_packed: 0,
      manual_name: 'Transport', excluded: false,
      product_packable_default: true,
      booking_packability_override: null,
      warehouse_packability_override: true,
      is_packable: true,
      packability_source: 'warehouse_override',
      packability_revision: 3,
    }], CTX);
    expect(plan.updates).toEqual([{
      id: 'row1',
      patch: {
        product_packable_default: false,
        booking_packability_override: false,
      },
    }]);
  });
});

function fakeFetch(map: Record<string, { status?: number; body: unknown }>) {
  return async (url: any) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    const hit = key ? map[key] : { status: 404, body: { error: 'not found' } };
    return {
      ok: (hit.status ?? 200) < 400,
      status: hit.status ?? 200,
      text: async () => JSON.stringify(hit.body),
    } as any;
  };
}

describe('resolveWmsReservation', () => {
  it('slår upp reservationens UUID från bokningsnumret', async () => {
    const res = await resolveWmsReservation('2609-9', {
      apiKey: 'k',
      organizationId: 'org1',
      fetchImpl: fakeFetch({ 'get-reservation?': { body: { data: { reservation: { id: 'uuid-1' } } } } }),
    });
    expect(res).toMatchObject({ ok: true, reservationId: 'uuid-1' });
  });

  it('bevarar exakt status/updated_at/synced_at och tolkar aldrig till is_released/is_active', async () => {
    const res = await resolveWmsReservation('2609-9', {
      apiKey: 'k',
      organizationId: 'org1',
      fetchImpl: fakeFetch({
        'get-reservation?': {
          body: {
            data: {
              reservation: {
                id: 'uuid-42',
                status: 'ÅTERLÄMNAD_X',
                updated_at: '2026-09-01T10:00:00Z',
                synced_at: '2026-09-01T10:05:00Z',
                is_released: true,
                is_active: false,
              },
            },
          },
        },
      }),
    });
    expect(res).toEqual({
      ok: true,
      reservationId: 'uuid-42',
      externalId: '2609-9',
      status: 'ÅTERLÄMNAD_X',
      updatedAt: '2026-09-01T10:00:00Z',
      syncedAt: '2026-09-01T10:05:00Z',
    });
    expect(JSON.stringify(res)).not.toMatch(/is_released|is_active/);
  });

  it('saknade fält blir null utan fallback', async () => {
    const res = await resolveWmsReservation('2609-9', {
      apiKey: 'k',
      organizationId: 'org1',
      fetchImpl: fakeFetch({ 'get-reservation?': { body: { reservation: { id: 'uuid-2' } } } }),
    });
    expect(res).toMatchObject({ ok: true, status: null, updatedAt: null, syncedAt: null });
  });

  it('döljer inte saknad reservation', async () => {
    const res = await resolveWmsReservation('X', {
      apiKey: 'k',
      organizationId: 'org1',
      fetchImpl: fakeFetch({ 'get-reservation?': { status: 404, body: { code: 'reservation_not_found' } } }),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('wms_reservation_not_found');
  });
});


describe('syncPackingListFromWms', () => {
  function fakeClient(existing: any[]) {
    const inserted: any[] = [];
    const client = {
      inserted,
      from() {
        const q: any = {
          select: () => q,
          eq: () => q,
          in: () => q,
          then: undefined,
          insert: async (rows: any[]) => { inserted.push(...rows); return { error: null }; },
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }), in: () => ({ eq: async () => ({ error: null }) }) }),
        };
        // select().eq().eq() resolves to data
        q.eq = () => ({ ...q, eq: async () => ({ data: existing, error: null }) });
        return q;
      },
    };
    return client;
  }

  it('speglar reservationen till packrader', async () => {
    const client = fakeClient([]);
    const res = await syncPackingListFromWms(client as any, {
      packingId: 'pk1',
      organizationId: 'org1',
      bookingNumber: '2609-9',
      sourceBookingId: 'booking1',
      apiKey: 'k',
      hmacSecret: 'test-secret-at-least-16-characters',
      actor: { organizationId: 'org1', personnelId: 'user1', label: 'Testare' },
      deviceId: 'planning-web:user1',
      projectionUrl: 'https://wms.invalid/outbound/projection',
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      nonce: () => 'nonce123456789012',
      fetchImpl: fakeFetch({
        '/outbound/projection': { body: {
          bookingId: 'booking1',
          reservationId: 'uuid-1',
          revision: 1,
          lines: [
            { reservationLineId: 'l1', kind: 'line', parentLineId: null, label: 'Vägg 3m', requiredQuantity: 6, packedQuantity: 0, itemTypeId: 'it1', sku: 'V3' },
            { reservationLineId: 'l2', kind: 'group', parentLineId: null, label: 'Tältpaket', requiredQuantity: 2, packedQuantity: 0, packageId: 'pkg1' },
            { reservationLineId: 'l2-c1', kind: 'line', parentLineId: 'l2', label: 'Tältduk', requiredQuantity: 2, packedQuantity: 0, itemTypeId: 'it2', relationshipKind: 'package_member' },
            { reservationLineId: 'l2-c2', kind: 'line', parentLineId: 'l2', label: 'Ben', requiredQuantity: 8, packedQuantity: 0, itemTypeId: 'it3', relationshipKind: 'package_member' },
          ],
        } },
      }),
    });
    expect(res).toMatchObject({ ok: true, reservationId: 'uuid-1', inserted: 3, total: 3 });
    expect(client.inserted).toHaveLength(3);
  });

  it('rapporterar WMS-fel ärligt istället för att skapa lokala rader', async () => {
    const client = fakeClient([]);
    const res = await syncPackingListFromWms(client as any, {
      packingId: 'pk1',
      organizationId: 'org1',
      bookingNumber: '2609-9',
      sourceBookingId: 'booking1',
      apiKey: 'k',
      hmacSecret: 'test-secret-at-least-16-characters',
      actor: { organizationId: 'org1', personnelId: 'user1', label: 'Testare' },
      deviceId: 'planning-web:user1',
      projectionUrl: 'https://wms.invalid/outbound/projection',
      fetchImpl: fakeFetch({
        '/outbound/projection': { status: 500, body: { error: 'boom' } },
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('wms_unavailable');
    expect(client.inserted).toHaveLength(0);
  });
});
