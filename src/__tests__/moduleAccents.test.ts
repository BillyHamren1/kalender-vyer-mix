import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MODULE_PALETTE, resolveModuleFromPath } from '@/lib/layout/moduleAccents';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('canonical EventFlow module palette', () => {
  it('locks the shared HUB teal accent (standard 2026-10-18)', () => {
    for (const key of ['planning', 'warehouse'] as const) {
      expect(MODULE_PALETTE[key].baseHex).toBe('#1F747A');
      expect(MODULE_PALETTE[key].darkHex).toBe('#156065');
      expect(MODULE_PALETTE[key].brightHex).toBe('#4DC3CB'); // HUB dark-surface fix (abab70a)
      expect(MODULE_PALETTE[key].base).toBe('hsl(183.956 59.4771% 30%)');
      expect(MODULE_PALETTE[key].dark).toBe('hsl(183.75 65.5738% 23.9216%)');
    }
  });

  it('uses one shared teal accent in all modules — no per-module colours', () => {
    expect(MODULE_PALETTE.planning).toEqual(MODULE_PALETTE.warehouse);
    // no violet (≈255) or orange (≈32) anywhere in the module identity palette
    for (const p of Object.values(MODULE_PALETTE)) {
      for (const v of [p.base, p.dark, p.soft, p.border, p.hover, p.ring]) {
        const hue = Number(/hsl\((\d+)/.exec(v)?.[1]);
        expect(hue >= 170 && hue <= 200).toBe(true);
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
    expect(css).toContain('183.956 59.4771% 30%');
    expect(css).toContain('183.75 65.5738% 23.9216%');
    expect(read('src/index.css')).toContain('module-accents.css');
  });

  it('does not repaint semantic status colours', () => {
    const css = read('src/styles/module-accents.css');
    expect(css).not.toMatch(/--destructive|--success|--warning/);
  });
});
