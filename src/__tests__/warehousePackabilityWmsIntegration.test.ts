import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildWarehousePackabilityRequest,
  parseWarehousePackabilityReceipt,
} from '../../supabase/functions/_shared/warehousePackabilityWms';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const edge = read('supabase/functions/edit-packing-list/index.ts');
const migration = read('supabase/migrations/20260916103000_apply_wms_packability_receipt.sql');

const receipt = {
  operation_id: '11111111-1111-4111-8111-111111111111',
  line_id: 'wms-line/42',
  product_packable_default: true,
  booking_packability_override: null,
  warehouse_packability_override: false,
  is_packable: false,
  packability_source: 'warehouse_override',
  packability_revision: 8,
  updated_at: '2026-09-16T10:30:00.000Z',
  idempotent: false,
} as const;

describe('canonical WMS warehouse packability request', () => {
  it('sends the exact authenticated PATCH contract', () => {
    const request = buildWarehousePackabilityRequest({
      baseUrl: 'https://wms.example/functions/v1/',
      apiKey: 'warehouse-secret',
      organizationId: 'org-1',
      operationId: receipt.operation_id,
      lineId: receipt.line_id,
      override: false,
      expectedRevision: 7,
    });

    expect(request.url).toBe('https://wms.example/functions/v1/reservation-lines/wms-line%2F42/packability');
    expect(request.init.method).toBe('PATCH');
    expect(request.init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer warehouse-secret',
      'x-organization-id': 'org-1',
      'Idempotency-Key': receipt.operation_id,
    });
    expect(JSON.parse(String(request.init.body))).toEqual({
      source: 'warehouse',
      override: false,
      expected_revision: 7,
    });
  });

  it('sends reset as override null and fails closed without identity/config/revision', () => {
    const reset = buildWarehousePackabilityRequest({
      baseUrl: 'https://wms.example',
      apiKey: 'secret',
      organizationId: 'org',
      operationId: receipt.operation_id,
      lineId: 'line',
      override: null,
      expectedRevision: 1,
    });
    expect(JSON.parse(String(reset.init.body)).override).toBeNull();
    expect(() => buildWarehousePackabilityRequest({ baseUrl: 'x', apiKey: '', organizationId: 'o', operationId: 'i', lineId: 'l', override: true, expectedRevision: 1 })).toThrow('wms_secret_missing');
    expect(() => buildWarehousePackabilityRequest({ baseUrl: 'x', apiKey: 'k', organizationId: 'o', operationId: 'i', lineId: '', override: true, expectedRevision: 1 })).toThrow('wms_line_id_missing');
    expect(() => buildWarehousePackabilityRequest({ baseUrl: 'x', apiKey: 'k', organizationId: 'o', operationId: 'i', lineId: 'l', override: true, expectedRevision: 0 })).toThrow('invalid_expected_revision');
  });
});

describe('canonical WMS receipt verification', () => {
  it('accepts only the matching complete receipt', () => {
    expect(parseWarehousePackabilityReceipt(receipt, {
      operationId: receipt.operation_id,
      lineId: receipt.line_id,
      override: false,
    })).toEqual(receipt);
  });

  it('rejects mismatched identity, override, effective value and malformed receipts', () => {
    const expected = { operationId: receipt.operation_id, lineId: receipt.line_id, override: false };
    expect(() => parseWarehousePackabilityReceipt({ ...receipt, operation_id: 'other' }, expected)).toThrow('wms_bad_receipt');
    expect(() => parseWarehousePackabilityReceipt({ ...receipt, line_id: 'other' }, expected)).toThrow('wms_bad_receipt');
    expect(() => parseWarehousePackabilityReceipt({ ...receipt, warehouse_packability_override: true }, expected)).toThrow('wms_bad_receipt');
    expect(() => parseWarehousePackabilityReceipt({ ...receipt, is_packable: true }, expected)).toThrow('wms_bad_receipt');
    expect(() => parseWarehousePackabilityReceipt({ ...receipt, packability_revision: 0 }, expected)).toThrow('wms_bad_receipt');
  });
});

describe('Edge orchestration contract', () => {
  it('derives tenant/actor, requires warehouse role and canonical secrets', () => {
    expect(edge).toContain('auth.getUser(jwt)');
    expect(edge).toContain(".eq('organization_id', profile.organization_id)");
    expect(edge).toContain(".in('role', ['admin', 'lager'])");
    expect(edge).toContain("Deno.env.get('WAREHOUSE_PACKABILITY_API_KEY')");
    expect(edge).toContain("Deno.env.get('BUNDLE_SUPABASE_FUNCTIONS_URL') || WMS_PACKABILITY_BASE_URL");
    expect(edge).toContain("code: 'wms_base_url_mismatch'");
  });

  it('fails closed before WMS on missing line, touched row or local revision conflict', () => {
    expect(edge).toContain("code: 'wms_line_id_missing'");
    expect(edge).toContain("code: 'row_touched'");
    expect(edge).toContain("code: 'revision_conflict'");
    expect(edge.indexOf("if (!item.wms_line_id)")).toBeLessThan(edge.indexOf('await fetch(upstream.url'));
    expect(edge.indexOf('if (isTouched(item')).toBeLessThan(edge.indexOf('await fetch(upstream.url'));
  });

  it('projects only after a successful, verified WMS receipt', () => {
    const fetchIndex = edge.indexOf('await fetch(upstream.url');
    const parseIndex = edge.indexOf('parseWarehousePackabilityReceipt(responseBody');
    const projectionIndex = edge.indexOf("supabase.rpc('apply_wms_packability_receipt'");
    expect(fetchIndex).toBeGreaterThan(0);
    expect(parseIndex).toBeGreaterThan(fetchIndex);
    expect(projectionIndex).toBeGreaterThan(parseIndex);
    expect(edge).not.toMatch(/from\('packing_list_items'\)[\s\S]{0,300}\.update\(/);
  });

  it('returns upstream revision conflicts and never projects failed responses', () => {
    expect(edge).toContain("upstreamCode === 'revision_conflict' ? 'revision_conflict'");
    expect(edge).toContain('if (!response.ok)');
    expect(edge.indexOf('if (!response.ok)')).toBeLessThan(edge.indexOf("supabase.rpc('apply_wms_packability_receipt'"));
  });
});

describe('service-only atomic local projection', () => {
  it('scopes and locks packing + line, verifies WMS identity and local revision', () => {
    expect(migration).toContain('id = _packing_id AND organization_id = _organization_id');
    expect(migration).toContain('id = _item_id AND packing_id = _packing_id AND organization_id = _organization_id');
    expect(migration.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain('v_item.wms_line_id IS DISTINCT FROM _wms_line_id');
    expect(migration).toContain('v_item.packability_revision IS DISTINCT FROM _expected_local_revision');
    expect(migration).toContain("_wms_receipt->>'operation_id' IS DISTINCT FROM _operation_id::text");
    expect(migration).toContain("_wms_receipt->>'line_id' IS DISTINCT FROM _wms_line_id");
  });

  it('rechecks touched state and atomically writes projection plus audit', () => {
    expect(migration).toContain('COALESCE(v_item.quantity_packed, 0) > 0');
    expect(migration).toContain('packing_list_item_allocations');
    expect(migration).toContain("RAISE EXCEPTION 'row_touched'");
    expect(migration).toContain('UPDATE public.packing_list_items');
    expect(migration).toContain('INSERT INTO public.packing_packability_events');
    expect(migration).toContain("'warehouse_web'");
  });

  it('is service-role-only and closes the legacy local-first bypass', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.apply_wms_packability_receipt');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
    expect(migration).toContain("to_regprocedure('public.set_packing_list_item_packability");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.set_packing_list_item_packability');
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.set_packing_list_item_packability[\s\S]{0,180}authenticated/);
  });
});
