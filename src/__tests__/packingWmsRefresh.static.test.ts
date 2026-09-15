import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('manual WMS refresh on packing project', () => {
  const page = read('src/pages/PackingDetail.tsx');
  const service = read('src/services/packingWmsRefreshService.ts');

  it('has a visible WMS action and does not disguise a local reload as sync', () => {
    expect(page).toContain('Uppdatera från WMS');
    expect(page).toContain('Ladda om sidan');
    expect(page).toContain('handleRefreshFromWms');
  });

  it('waits for the canonical sync and targets the open packing project', () => {
    expect(service).toContain('await syncBookingToPacking');
    expect(service).toContain('throwOnError: true');
    expect(service).toContain('targetPackingId: packingId');
  });

  it('verifies both active product and pack rows are WMS-backed', () => {
    expect(service).toContain(".is('source_missing_since', null)");
    expect(service).toContain("product.sync_key?.startsWith('wms:')");
    expect(service).toContain('!row.wms_line_id');
    expect(service).toContain(".or('excluded.eq.false,excluded.is.null')");
  });

  it('shows success only after verification and a visible error otherwise', () => {
    expect(page).toContain('setWmsRefreshResult(result)');
    expect(page).toContain('WMS verifierat');
    expect(page).toContain('WMS kunde inte verifieras');
  });
});
