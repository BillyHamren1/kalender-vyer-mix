import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260916091500_packability_contract.sql');
const receiptMigration = read('supabase/migrations/20260916103000_apply_wms_packability_receipt.sql');
const edge = read('supabase/functions/edit-packing-list/index.ts');

describe('packability schema contract', () => {
  it('keeps old rows packable and separates all three precedence levels', () => {
    expect(migration).toContain('product_packable_default boolean NOT NULL DEFAULT true');
    expect(migration).toContain('packability_override boolean');
    expect(migration).toContain('booking_packability_override boolean');
    expect(migration).toContain('warehouse_packability_override boolean');
    expect(migration).toContain("WHEN _warehouse_override IS NOT NULL THEN 'warehouse_override'");
    expect(migration).toContain("WHEN v_item.booking_packability_override IS NOT NULL THEN 'booking_override'");
  });

  it('uses a service-only, tenant/role-verified and idempotent write boundary', () => {
    expect(migration).toContain('UNIQUE (organization_id, operation_id)');
    expect(migration).toContain("ur.role IN ('admin'::public.app_role, 'lager'::public.app_role)");
    expect(migration).toContain('RAISE EXCEPTION \'revision_conflict\'');
    expect(migration).toContain('RAISE EXCEPTION \'row_touched\'');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});

describe('packability Edge contract', () => {
  it('derives tenant/actor from JWT and accepts the three warehouse operations', () => {
    expect(edge).toContain("supabase.auth.getUser(jwt)");
    expect(edge).toContain(".select('organization_id, full_name')");
    expect(edge).toContain("['set_packable', 'set_non_packable', 'reset_packability']");
    expect(edge).toContain(".in('role', ['admin', 'lager'])");
    expect(edge).toContain("Deno.env.get('WAREHOUSE_PACKABILITY_API_KEY')");
    expect(edge).toContain("rpc('apply_wms_packability_receipt'");
    expect(edge).toContain('_expected_local_revision: expectedRevision');
    expect(receiptMigration).toContain('REVOKE ALL ON FUNCTION public.set_packing_list_item_packability');
    expect(receiptMigration).toContain('GRANT EXECUTE ON FUNCTION public.apply_wms_packability_receipt');
    expect(receiptMigration).toContain('TO service_role');
  });
});
