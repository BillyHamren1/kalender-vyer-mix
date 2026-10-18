import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MODULE_PALETTE } from '@/lib/layout/moduleAccents';
import { MOBILE_BAR } from '@/lib/layout/mobileBars';
import { SIDEBAR_CONTRACT } from '@/lib/layout/sidebarContract';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

/** HSL triplet ("h s% l%") → hex, using the same maths as browsers. */
function hslToHex(triplet: string): string {
  const [h, s, l] = triplet.replace(/%/g, '').trim().split(/\s+/).map(Number);
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string) {
  const [r, g, b] = hexRgb(hex).map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = (css: string, name: string) => {
  const m = css.match(new RegExp(`${name}:\\s*([0-9.]+ [0-9.]+% [0-9.]+%)`));
  if (!m) throw new Error(`missing ${name}`);
  return m[1];
};

describe('exact EventFlow colours resolve to the specified RGB', () => {
  const index = read('src/index.css');
  const planning = read('src/styles/planning.css');
  const accents = read('src/styles/module-accents.css');

  it('root tokens render the exact hex values', () => {
    expect(hslToHex(token(index, '--foreground'))).toBe('#202223');
    expect(hslToHex(token(index, '--heading'))).toBe('#202223');
    expect(hslToHex(token(index, '--muted-foreground'))).toBe('#62666A');
    expect(hslToHex(token(index, '--action'))).toBe('#1F747A');
    expect(hslToHex(token(index, '--action-end'))).toBe('#156065');
    expect(hslToHex(token(index, '--background'))).toBe('#EDF1F3');
    expect(hslToHex(token(index, '--sidebar-background'))).toBe('#FFFFFF');
  });

  it('planning and module-accent layers use the same exact values', () => {
    expect(hslToHex(token(planning, '--foreground'))).toBe('#202223');
    expect(hslToHex(token(planning, '--muted-foreground'))).toBe('#62666A');
    expect(hslToHex(token(accents, '--module-accent'))).toBe('#1F747A');
    expect(hslToHex(token(accents, '--module-accent-dark'))).toBe('#156065');
    for (const key of ['planning', 'warehouse'] as const) {
      expect(hslToHex(MODULE_PALETTE[key].base.replace(/hsl\(|\)/g, ''))).toBe('#1F747A');
      expect(hslToHex(MODULE_PALETTE[key].dark.replace(/hsl\(|\)/g, ''))).toBe('#156065');
    }
  });

  it('primary and ring follow the shared action accent', () => {
    expect(index).toMatch(/--primary: var\(--action\)/);
    expect(index).toMatch(/--ring: var\(--action\)/);
  });

  it('meets contrast: text on canvas/white, white on teal, teal marker on black bar', () => {
    expect(contrast('#202223', '#EDF1F3')).toBeGreaterThan(12);
    expect(contrast('#62666A', '#FFFFFF')).toBeGreaterThan(4.5);
    expect(contrast('#FFFFFF', '#1F747A')).toBeGreaterThan(4.5);
    const bar = hslToHex(MOBILE_BAR.background.replace(/hsl\(|\)/g, ''));
    expect(contrast(MOBILE_BAR.activeMarker, bar)).toBeGreaterThanOrEqual(3); // non-text marker
    expect(contrast(MOBILE_BAR.activeMarker, bar)).toBeLessThan(4.5); // therefore never used for small labels
    expect(contrast(hslToHex(MOBILE_BAR.inactive.replace(/hsl\(|\)/g, '')), bar)).toBeGreaterThan(4.5);
  });

  it('sidebar contract is 240/64/44 and both modules start with Översikt', () => {
    expect([SIDEBAR_CONTRACT.widthPx, SIDEBAR_CONTRACT.collapsedWidthPx, SIDEBAR_CONTRACT.rowHeightPx]).toEqual([240, 64, 44]);
    expect(read('src/components/Sidebar3D.tsx')).toMatch(/title: "Översikt",\s*url: "\/projects"/);
    expect(read('src/components/WarehouseSidebar3D.tsx')).toContain('{ title: "Översikt", url: "/warehouse"');
  });
});
