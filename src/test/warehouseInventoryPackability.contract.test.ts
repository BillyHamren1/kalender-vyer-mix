import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/WarehouseInventoryPlaceholder.tsx', 'utf8');
const service = fs.readFileSync('src/services/wmsInventoryService.ts', 'utf8');
const proxy = fs.readFileSync('supabase/functions/wms-item-types-admin/index.ts', 'utf8');

describe('Warehouse Inventory packability UI contract', () => {
  it('offers product edit and explicit default-packability control', () => {
    expect(page).toContain('Packningsbar som standard');
    expect(page).toContain('setEditing(item)');
    expect(page).toContain('updateWmsItemTypePackability');
  });

  it('supports safe, selected-row bulk edits without name heuristics', () => {
    expect(page).toContain('selectedItems.length');
    expect(page).toContain('Ej packningsbara');
    expect(page).toContain('Packningsbara');
    expect(service).not.toMatch(/\/transport\/|\/ob\//i);
  });

  it('uses protected WMS boundary, revision checks and canonical field name', () => {
    expect(service).toContain("functions.invoke('wms-item-types-admin'");
    expect(service).toContain('is_packable_default');
    expect(service).toContain('expected_revision');
    expect(proxy).toContain("row.role === 'admin' || row.role === 'lager'");
    expect(proxy).toContain("'x-organization-id': organizationId");
    expect(proxy).toContain("Deno.env.get('INVENTORY_PACKABILITY_API_KEY')");
    expect(proxy).toContain("'Idempotency-Key': idempotencyKey");
    expect(proxy).toContain('upstreamBody = { changes: items }');
  });
});
