import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * En avslutad (fryst) packning får aldrig skrivas om av normal bokningssynk.
 * Det är ett förväntat no-op — INTE ett importfel som ska ge outcome "partial"
 * och evig "SYNK MISSLYCKAD" i lagerpanelen.
 */
const src = readFileSync(
  resolve(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf8',
);

describe('import-bookings: frozen packing is not an import error', () => {
  it('behandlar status_frozen som skip före felgrenen', () => {
    const frozenIdx = src.indexOf("repairResult.code === 'status_frozen'");
    expect(frozenIdx).toBeGreaterThan(-1);
    const failIdx = src.indexOf('packing_row_creation_failed:${message}');
    expect(failIdx).toBeGreaterThan(frozenIdx);
  });

  it('räknar inte upp results.failed i status_frozen-grenen', () => {
    const start = src.indexOf("repairResult.code === 'status_frozen'");
    const block = src.slice(start, src.indexOf('} else if (!repairResult.ok)', start));
    expect(block).not.toContain('results.failed++');
    expect(block).not.toContain('results.errors.push');
  });

  it('behåller felhantering för övriga repair-fel', () => {
    expect(src).toContain('packing_row_creation_failed:${message}');
  });
});
