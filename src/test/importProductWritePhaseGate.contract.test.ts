import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
const lines = src.split('\n');
const strip = (l: string) => l
  .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '')
  .replace(/\/\/.*$/, '');
/** Rad (0-baserad) där blocket som öppnas på raden `start` stängs. */
function blockEnd(start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const s = strip(lines[i]);
    depth += (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
    if (i > start && depth <= 0) return i;
    if (i === start && depth <= 0 && s.includes('}')) return i;
  }
  return -1;
}
const lineOf = (needle: string, from = 0) => lines.findIndex((l, i) => i >= from && l.includes(needle));

describe('FA-2611-1-regression: ingen produktradering utan produktskrivning', () => {
  it('raderingsplanen kräver productWritePhase (mandat + processade produkter)', () => {
    expect(src).toMatch(/const productWritePhase = \(needsProductUpdate \|\| !existingBooking\) && bookingProductScope\.productsAllowed;/);
    expect(src).toMatch(/if \(productWritePhase && oldProducts && oldProducts\.length > 0 && externalProductCount > 0 && productDeleteAllowed\)/);
  });
  it('expansion och huvudflödets packsynk ligger inne i productWritePhase-blocket', () => {
    const open = lineOf('if (productWritePhase) {');
    expect(open).toBeGreaterThan(0);
    const end = blockEnd(open);
    const expand = lineOf('const mainExpanded = await expandPackageComponents', open);
    const pack = lineOf('const mainPackingResult = await', open);
    expect(expand).toBeGreaterThan(open);
    expect(pack).toBeGreaterThan(open);
    expect(pack).toBeLessThan(end);
  });
  it('produktuppsert-blocket kräver mandat', () => {
    expect(src).toMatch(/if \(\(needsProductUpdate \|\| !existingBooking\) && bookingProductScope\.productsAllowed\) \{/);
  });
  it('källmarkering source_missing_since skrivs inte utan mandat', () => {
    expect(src).toMatch(/if \(allowProductWrites\) try \{/);
    expect(src).toMatch(/bookingData\.organization_id,\s*bookingProductScope\.productsAllowed,\s*\)/);
  });
  it('deferral nollställer återställning så clear+reimport aldrig körs', () => {
    expect(src).toMatch(/needsProductUpdate = false;\s*needsProductRecovery = false;/);
  });
});

describe('Sales-tid med endast start ("14:00")', () => {
  const fnSrc = (src.match(/^const parseTimeRange[\s\S]*?\n};/m) || [''])[0]
    .replace(/: unknown/g, '').replace(/\): \{[^}]*\} \| undefined =>/, ') =>').replace(/\(t: string\): string =>/, '(t) =>').replace(/singleMatch!/g, 'singleMatch');
  // eslint-disable-next-line no-new-func
  const parseTimeRange = new Function(`${fnSrc}; return parseTimeRange;`)() as (v: unknown) => { start: string; end?: string } | undefined;
  it('ensam tid blir explicit start utan sluttid', () => {
    expect(parseTimeRange('14:00')).toEqual({ start: '14:00:00' });
  });
  it('intervall fungerar som förut', () => {
    expect(parseTimeRange('08:00 - 12:00')).toEqual({ start: '08:00:00', end: '12:00:00' });
  });
  it('skräp ger ingen tid', () => {
    expect(parseTimeRange('morgon')).toBeUndefined();
    expect(parseTimeRange('')).toBeUndefined();
  });
});
