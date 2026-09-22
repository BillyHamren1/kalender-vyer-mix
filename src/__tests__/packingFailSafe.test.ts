/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { ensureMissingPackingRowsFromBookingProducts } from '../../supabase/functions/_shared/packingFailSafe';

const createSupabase = (products: any[], existing: any[]) => {
  const insertedRows: any[] = [];
  const updatedRows: any[] = [];
  const responses: Record<string, any> = {
    booking_products: { data: products, error: null },
    packing_list_items: { data: existing, error: null },
  };
  const from = (table: string) => {
    const response = responses[table];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      insert: async (rows: any[]) => {
        insertedRows.push(...rows);
        return { error: null };
      },
      update: (values: any) => {
        const updateBuilder: any = {
          eq: () => updateBuilder,
          then: (resolve: (v: any) => unknown, reject: (r: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        };
        updatedRows.push(values);
        return updateBuilder;
      },
      then: (resolve: (v: any) => unknown, reject: (r: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject),
    };
    return builder;
  };
  return { supabase: { from }, insertedRows, updatedRows };
};

const args = { packingId: 'pack-1', bookingId: 'booking-1', organizationId: 'org-1' };

describe('ensureMissingPackingRowsFromBookingProducts', () => {
  it('importerar även rader som inte är packningsbara (transport/manuella)', async () => {
    const { supabase, insertedRows } = createSupabaseFixture();
    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(3);
    const names = insertedRows.map((r) => r.booking_product_id).sort();
    expect(names).toEqual(['manual-1', 'prod-1', 'transport-1']);
    const transport = insertedRows.find((r) => r.booking_product_id === 'transport-1');
    expect(transport.is_packable).toBe(false);
    expect(transport.quantity_to_pack).toBe(2);
  });

  it('är idempotent — andra körningen skapar inga dubbletter', async () => {
    const first = createSupabaseFixture();
    await ensureMissingPackingRowsFromBookingProducts(first.supabase, args);

    const existing = first.insertedRows.map((row, index) => ({
      id: `item-${index}`,
      booking_product_id: row.booking_product_id,
      wms_line_id: row.wms_line_id,
      excluded: false,
    }));
    const second = createSupabase(fixtureProducts(), existing);
    const result = await ensureMissingPackingRowsFromBookingProducts(second.supabase, args);

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(second.insertedRows).toEqual([]);
  });

  it('läker packbarhetsmetadata på befintlig aktiv rad utan att skapa dubblett', async () => {
    const existing = [{
      id: 'item-transport',
      booking_product_id: 'transport-1',
      wms_line_id: null,
      excluded: false,
      planning_excluded_at: null,
      product_packable_default: true,
      booking_packability_override: null,
      warehouse_packability_override: null,
      is_packable: true,
      packability_source: 'product_default',
      packability_revision: 1,
    }];
    const { supabase, insertedRows, updatedRows } = createSupabase(
      [fixtureProducts()[1]],
      existing,
    );

    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);

    expect(result).toMatchObject({ ok: true, inserted: 0, updated: 1, total: 1 });
    expect(insertedRows).toEqual([]);
    expect(updatedRows).toEqual([{
      product_packable_default: true,
      booking_packability_override: null,
      is_packable: false,
      packability_source: 'product_default',
      packability_revision: 2,
    }]);
  });

  it('bevarar lageroverride när Booking ändrar grundklassningen', async () => {
    const existing = [{
      id: 'item-transport',
      booking_product_id: 'transport-1',
      excluded: false,
      planning_excluded_at: null,
      product_packable_default: true,
      booking_packability_override: null,
      warehouse_packability_override: true,
      is_packable: true,
      packability_source: 'warehouse_override',
      packability_revision: 4,
    }];
    const product = {
      ...fixtureProducts()[1],
      product_packable_default: false,
      packability_override: false,
    };
    const { supabase, updatedRows } = createSupabase([product], existing);

    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);

    expect(result.updated).toBe(1);
    expect(updatedRows[0]).toMatchObject({
      product_packable_default: false,
      booking_packability_override: false,
      is_packable: true,
      packability_source: 'warehouse_override',
    });
  });

  it('återupplivar aldrig historiskt utfasade rader', async () => {
    const { supabase, insertedRows } = createSupabase(
      [{ id: 'prod-1', name: 'Tält', quantity: 1, sync_key: 'src:1', source_missing_since: null }],
      [{ id: 'item-1', booking_product_id: 'prod-1', wms_line_id: null, excluded: true }],
    );
    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);
    expect(result.inserted).toBe(0);
    expect(insertedRows).toEqual([]);
  });

  it('hoppar över retirerade produktrader och paketrubriker', async () => {
    const { supabase, insertedRows } = createSupabase(
      [
        { id: 'header-1', name: 'Paket', quantity: 1, sync_key: 'src:h', source_missing_since: null },
        { id: 'child-1', name: 'Del', quantity: 1, parent_product_id: 'header-1', sync_key: 'src:c', source_missing_since: null },
        { id: 'gone-1', name: 'Borttagen', quantity: 1, sync_key: 'src:g', source_missing_since: '2026-09-15T00:00:00Z' },
      ],
      [],
    );
    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);
    expect(result.inserted).toBe(1);
    expect(insertedRows[0].booking_product_id).toBe('child-1');
  });

  it('fyller aldrig på en lista som redan har aktiva rader (inga dubbletter)', async () => {
    const { supabase, insertedRows } = createSupabase(
      [
        { id: 'unit-1', name: 'H Mastertent (#1)', quantity: 1, sync_key: 'wms:line-a::unit-1', source_missing_since: null },
        { id: 'unit-2', name: 'H Mastertent (#2)', quantity: 1, sync_key: 'wms:line-a::unit-2', source_missing_since: null },
      ],
      [{ id: 'item-agg', booking_product_id: null, wms_line_id: 'line-a', excluded: false }],
    );
    const result = await ensureMissingPackingRowsFromBookingProducts(supabase, args);
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(insertedRows).toEqual([]);
  });
});

function fixtureProducts() {
  return [
    { id: 'prod-1', name: 'Tält 6x6', quantity: 1, sync_key: 'src:1', source_missing_since: null, is_packable: true },
    { id: 'transport-1', name: 'Transport', quantity: 2, sync_key: 'src:2', source_missing_since: null, is_packable: false },
    { id: 'manual-1', name: 'Manuell rad', quantity: 1, sync_key: 'src:3', source_missing_since: null },
  ];
}

function createSupabaseFixture() {
  return createSupabase(fixtureProducts(), []);
}
