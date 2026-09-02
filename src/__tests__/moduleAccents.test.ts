import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MODULE_PALETTE, resolveModuleFromPath } from '@/lib/layout/moduleAccents';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('canonical EventFlow module palette', () => {
  it('locks the HUB hex values', () => {
    expect(MODULE_PALETTE.planning.baseHex).toBe('#7357C8');
    expect(MODULE_PALETTE.planning.darkHex).toBe('#6849BE');
    expect(MODULE_PALETTE.warehouse.baseHex).toBe('#C77922');
    expect(MODULE_PALETTE.warehouse.darkHex).toBe('#9A5715');
  });

  it('keeps planning purple and warehouse warm orange', () => {
    expect(MODULE_PALETTE.planning.base).toBe('hsl(255 51% 56%)');
    expect(MODULE_PALETTE.warehouse.base).toBe('hsl(32 71% 46%)');
    // no teal (≈184) anywhere in the module identity palette
    for (const p of Object.values(MODULE_PALETTE)) {
      for (const v of [p.base, p.dark, p.soft, p.border, p.hover, p.ring]) {
        const hue = Number(/hsl\((\d+)/.exec(v)?.[1]);
        expect(hue >= 160 && hue <= 210).toBe(false);
      }
    }
  });

  it('resolves the module from the route, not from a local fallback', () => {
    expect(resolveModuleFromPath('/warehouse')).toBe('warehouse');
    expect(resolveModuleFromPath('/warehouse/packing/1')).toBe('warehouse');
    expect(resolveModuleFromPath('/calendar')).toBe('planning');
    expect(resolveModuleFromPath('/warehousing')).toBe('planning');
  });

  it('ships route-scoped css tokens for both modules', () => {
    const css = read('src/styles/module-accents.css');
    expect(css).toContain("html[data-module='planning']");
    expect(css).toContain("html[data-module='warehouse']");
    expect(css).toContain('255 51% 56%');
    expect(css).toContain('32 71% 46%');
    expect(read('src/index.css')).toContain('module-accents.css');
  });

  it('does not repaint semantic status colours', () => {
    const css = read('src/styles/module-accents.css');
    expect(css).not.toMatch(/--destructive|--success|--warning/);
  });
});
