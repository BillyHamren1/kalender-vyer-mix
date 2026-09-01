import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SIDEBAR_CONTRACT,
  SIDEBAR_SURFACE,
  PLANNING_ACCENT,
  WAREHOUSE_ACCENT,
  sidebarRowStyle,
  sidebarNestedRowStyle,
  sidebarSectionLabelStyle,
  sidebarActiveBarStyle,
  sidebarSurfaceStyle,
} from '@/lib/layout/sidebarContract';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('canonical EventFlow sidebar contract', () => {
  it('locks the exact contract values', () => {
    expect(SIDEBAR_CONTRACT.widthPx).toBe(264);
    expect(SIDEBAR_CONTRACT.rowHeightPx).toBe(40);
    expect(SIDEBAR_CONTRACT.iconSizePx).toBe(18);
    expect(SIDEBAR_CONTRACT.sectionLabelSizePx).toBe(12);
    expect(SIDEBAR_CONTRACT.sectionLabelTracking).toBe('0.08em');
    expect(SIDEBAR_CONTRACT.rowRadiusPx).toBe(8);
    expect(SIDEBAR_CONTRACT.activeLeftBarPx).toBe(3);
  });

  it('renders 40px rows with 8px radius and 1px accent border when active', () => {
    const active = sidebarRowStyle({ active: true, accent: PLANNING_ACCENT });
    expect(active.height).toBe(40);
    expect(active.minHeight).toBe(40);
    expect(active.borderRadius).toBe(8);
    expect(active.border).toBe(`1px solid ${PLANNING_ACCENT.border}`);
    expect(active.background).toBe(PLANNING_ACCENT.soft);

    const idle = sidebarRowStyle({ active: false, accent: PLANNING_ACCENT });
    expect(idle.border).toBe('1px solid transparent');
    expect(idle.background).toBe('transparent');

    const hovered = sidebarRowStyle({ active: false, hovered: true, accent: WAREHOUSE_ACCENT });
    expect(hovered.background).toBe(WAREHOUSE_ACCENT.hover);
  });

  it('renders a 3px accent left line on active rows', () => {
    const bar = sidebarActiveBarStyle(WAREHOUSE_ACCENT);
    expect(bar.width).toBe(3);
    expect(bar.background).toBe(WAREHOUSE_ACCENT.base);
  });

  it('renders section headings at 12px uppercase / 0.08em', () => {
    const s = sidebarSectionLabelStyle();
    expect(s.fontSize).toBe(12);
    expect(s.textTransform).toBe('uppercase');
    expect(s.letterSpacing).toBe('0.08em');
  });

  it('keeps nested rows at the same 40px interaction height', () => {
    const nested = sidebarNestedRowStyle({ active: false, accent: PLANNING_ACCENT });
    expect(nested.height).toBe(40);
    expect(nested.borderRadius).toBe(8);
  });

  it('uses a pure white surface, cool-gray divider and soft right shadow', () => {
    const s = sidebarSurfaceStyle();
    expect(s.background).toBe('hsl(0 0% 100%)');
    expect(s.borderRight).toBe(`1px solid ${SIDEBAR_SURFACE.divider}`);
    expect(String(s.boxShadow)).toContain('2px 0 5px');
    expect(String(s.boxShadow)).toContain('8px 0 20px');
    expect(String(s.boxShadow)).not.toMatch(/inset|gradient/);
  });

  it('applies the contract in both module sidebars', () => {
    for (const file of [
      'src/components/Sidebar3D.tsx',
      'src/components/WarehouseSidebar3D.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('sidebarContract');
      expect(src).toContain('SIDEBAR_CONTRACT.widthPx');
      expect(src).toContain('sidebarRowStyle');
      expect(src).toContain('sidebarSurfaceStyle');
    }
  });

  it('keeps module accents separate (purple planning, orange warehouse)', () => {
    expect(PLANNING_ACCENT.base).not.toBe(WAREHOUSE_ACCENT.base);
    expect(PLANNING_ACCENT.base).toMatch(/^hsl\(27/);
    expect(WAREHOUSE_ACCENT.base).toMatch(/^hsl\(3/);
  });
});
