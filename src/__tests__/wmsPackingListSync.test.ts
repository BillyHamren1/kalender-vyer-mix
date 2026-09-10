import { describe, it, expect } from 'vitest';
import {
  flattenWmsPackingLines,
  planWmsPackingSync,
  resolveWmsReservation,
  syncPackingListFromWms,
} from '../../supabase/functions/_shared/wmsPackingList';

const CTX = { packingId: 'pk1', organizationId: 'org1' };

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
    { line_id: 'l3', type: 'item_type', name: 'Nollrad', required_qty: 0, sku: 'X', item_type_id: 'it9' },
  ],
};

describe('flattenWmsPackingLines', () => {
  it('plattar ut paket till komponenter och hoppar över paketrubriken', () => {
    const rows = flattenWmsPackingLines(wmsBody);
    expect(rows.map((r) => r.wmsLineId)).toEqual(['l1', 'l2::it2', 'l2::it3']);
    expect(rows[1]).toMatchObject({ name: 'Tältduk', quantity: 2, packageName: 'Tältpaket', itemTypeId: 'it2' });
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
});

describe('planWmsPackingSync', () => {
  it('skapar rader första gången med WMS-identitet', () => {
    const plan = planWmsPackingSync(flattenWmsPackingLines(wmsBody), [], CTX);
    expect(plan.inserts).toHaveLength(3);
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
    expect(plan.updates).toEqual([{ id: 'a', patch: { quantity_to_pack: 6 } }]);
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
      apiKey: 'k',
      fetchImpl: fakeFetch({
        'get-reservation?': { body: { data: { reservation: { id: 'uuid-1' } } } },
        'get-packing-list': { body: wmsBody },
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
      apiKey: 'k',
      fetchImpl: fakeFetch({
        'get-reservation?': { body: { data: { reservation: { id: 'uuid-1' } } } },
        'get-packing-list': { status: 500, body: { error: 'boom' } },
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('wms_unavailable');
    expect(client.inserted).toHaveLength(0);
  });
});
