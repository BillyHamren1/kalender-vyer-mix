/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { repairPackingItems } from '../../supabase/functions/_shared/packingRepair';

interface MockOptions {
  products?: any[];
  existingItems?: any[];
  productError?: Error | null;
}

const createSupabaseMock = (options: MockOptions = {}) => {
  const insertedRows: any[] = [];
  const responses: Record<string, any> = {
    packing_projects: { data: { id: 'pack-1', booking_id: 'booking-1', status: 'planning' }, error: null },
    bookings: { data: { booking_number: '2609-13' }, error: null },
    booking_products: {
      data: options.products ?? [
        {
          id: 'product-1',
          name: 'Bord',
          quantity: 4,
          parent_product_id: null,
          sku: 'BORD-1',
          inventory_item_type_id: 'type-bord',
          source_missing_since: null,
        },
      ],
      error: options.productError ?? null,
    },
    packing_list_items: { data: options.existingItems ?? [], error: null },
    packing_change_requests: { data: null, error: null },
  };

  const from = (table: string) => {
    const response = responses[table];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      update: () => builder,
      maybeSingle: async () => response,
      insert: async (rows: any[]) => {
        insertedRows.push(...rows);
        return { error: null };
      },
      then: (resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject),
    };
    return builder;
  };

  return { supabase: { from }, insertedRows };
};

describe('repairPackingItems', () => {
  afterEach(() => {
    delete (globalThis as any).Deno;
  });

  it('skapar saknade booking-rader med stabil lageridentitet', async () => {
    const { supabase, insertedRows } = createSupabaseMock();

    const result = await repairPackingItems(supabase, 'pack-1', 'org-1');

    expect(result).toMatchObject({
      ok: true,
      source: 'booking_products',
      inserted: 1,
      total: 1,
    });
    expect(insertedRows).toEqual([
      expect.objectContaining({
        packing_id: 'pack-1',
        booking_product_id: 'product-1',
        quantity_to_pack: 4,
        wms_item_type_id: 'type-bord',
        wms_sku: 'BORD-1',
      }),
    ]);
  });

  it('är idempotent och skapar inte en redan befintlig rad igen', async () => {
    const { supabase, insertedRows } = createSupabaseMock({
      existingItems: [{ id: 'item-1', booking_product_id: 'product-1' }],
    });

    const result = await repairPackingItems(supabase, 'pack-1', 'org-1');

    expect(result).toMatchObject({ ok: true, inserted: 0, total: 1 });
    expect(insertedRows).toEqual([]);
  });

  it('misslyckas stängt om bokningskällan är tom eller inte kan läsas', async () => {
    const empty = createSupabaseMock({ products: [] });
    const emptyResult = await repairPackingItems(empty.supabase, 'pack-1', 'org-1');
    expect(emptyResult).toMatchObject({ ok: false, code: 'source_empty' });
    expect(empty.insertedRows).toEqual([]);

    const failed = createSupabaseMock({ productError: new Error('database unavailable') });
    const failedResult = await repairPackingItems(failed.supabase, 'pack-1', 'org-1');
    expect(failedResult).toMatchObject({ ok: false, code: 'db_error' });
    expect(failed.insertedRows).toEqual([]);
  });
});
