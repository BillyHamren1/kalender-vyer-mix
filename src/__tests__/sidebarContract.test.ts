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
  resolveActiveNavIndex,
} from '@/lib/layout/sidebarContract';
import { MODULE_PALETTE } from '@/lib/layout/moduleAccents';
import { baseNavigationItems as planningNav } from '@/components/Sidebar3D';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('canonical EventFlow sidebar contract', () => {
  it('locks the exact contract values', () => {
    expect(SIDEBAR_CONTRACT.widthPx).toBe(264);
    expect(SIDEBAR_CONTRACT.rowHeightPx).toBe(40);
    expect(SIDEBAR_CONTRACT.iconSizePx).toBe(18);
    expect(SIDEBAR_CONTRACT.labelSizePx).toBe(14);
    expect(SIDEBAR_CONTRACT.rowGapPx).toBe(2);
    expect(SIDEBAR_CONTRACT.sectionLabelSizePx).toBe(12);
    expect(SIDEBAR_CONTRACT.sectionLabelTracking).toBe('0.08em');
    expect(SIDEBAR_CONTRACT.rowRadiusPx).toBe(8);
    expect(SIDEBAR_CONTRACT.activeLeftBarPx).toBe(3);
  });

  it('renders 40px rows with 8px radius and NO border in any state', () => {
    const states = [
      sidebarRowStyle({ active: true, accent: PLANNING_ACCENT }),
      sidebarRowStyle({ active: false, accent: PLANNING_ACCENT }),
      sidebarRowStyle({ active: false, hovered: true, accent: WAREHOUSE_ACCENT }),
      sidebarRowStyle({ active: true, collapsed: true, accent: WAREHOUSE_ACCENT }),
    ];
    for (const s of states) {
      expect(s.height).toBe(40);
      expect(s.minHeight).toBe(40);
      expect(s.borderRadius).toBe(8);
      expect(s.border).toBe('none');
      expect(s.outline).toBe('none');
      expect(s.boxShadow).toBe('none');
      expect(s.fontSize).toBe(14);
    }
  });

  it('gives inactive rows a fully transparent background and no tint box', () => {
    const idle = sidebarRowStyle({ active: false, accent: PLANNING_ACCENT });
    expect(idle.background).toBe('transparent');
    expect(idle.color).toBe(SIDEBAR_SURFACE.labelColor);

    const hovered = sidebarRowStyle({ active: false, hovered: true, accent: WAREHOUSE_ACCENT });
    expect(hovered.background).toBe(WAREHOUSE_ACCENT.hover);
    expect(hovered.border).toBe('none');

    const active = sidebarRowStyle({ active: true, accent: PLANNING_ACCENT });
    expect(active.background).toBe(PLANNING_ACCENT.soft);
    expect(active.color).toBe(PLANNING_ACCENT.base);
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

  it('keeps nested rows at 40px with no border', () => {
    for (const nested of [
      sidebarNestedRowStyle({ active: false, accent: PLANNING_ACCENT }),
      sidebarNestedRowStyle({ active: true, accent: PLANNING_ACCENT }),
    ]) {
      expect(nested.height).toBe(40);
      expect(nested.borderRadius).toBe(8);
      expect(nested.border).toBe('none');
      expect(nested.outline).toBe('none');
    }
    expect(
      sidebarNestedRowStyle({ active: false, accent: PLANNING_ACCENT }).background
    ).toBe('transparent');
  });

  it('resolves exactly one active row, even for duplicate urls', () => {
    const planning = [
      { url: '/my-page', exact: true },
      { url: '/projects' },
      { url: '/economy' },
      { url: '/ops-control' },
      { url: '/calendar' },
      { url: '/logistics/planning' },
      { url: '/staff-management', exact: true },
      { url: '/economy' },
    ];
    // duplicate /economy -> first declared entry only
    expect(resolveActiveNavIndex('/economy', planning)).toBe(2);
    expect(resolveActiveNavIndex('/logistics/planning', planning)).toBe(5);
    // parent with children does not light up on a child route
    expect(resolveActiveNavIndex('/staff-management/time', planning)).toBe(-1);
    expect(resolveActiveNavIndex('/unknown', planning)).toBe(-1);

    const warehouse = [
      { url: '/warehouse', exact: true },
      { url: '/warehouse/calendar' },
      { url: '/warehouse/economy' },
    ];
    expect(resolveActiveNavIndex('/warehouse', warehouse)).toBe(0);
    expect(resolveActiveNavIndex('/warehouse/calendar', warehouse)).toBe(1);
    expect(resolveActiveNavIndex('/warehouse/packing/123', warehouse)).toBe(-1);
  });


  it('uses a pure white surface, cool-gray divider and soft right shadow', () => {
    const s = sidebarSurfaceStyle();
    expect(s.background).toBe('hsl(0 0% 100%)');
    expect(s.borderRight).toBe(`1px solid ${SIDEBAR_SURFACE.divider}`);
    expect(String(s.boxShadow)).toContain('2px 0 5px');
    expect(String(s.boxShadow)).toContain('8px 0 20px');
    expect(String(s.boxShadow)).not.toMatch(/inset|gradient/);
  });

  it('applies the contract in both module sidebars and keeps rows border-free', () => {
    for (const file of [
      'src/components/Sidebar3D.tsx',
      'src/components/WarehouseSidebar3D.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('sidebarContract');
      expect(src).toContain('SIDEBAR_CONTRACT.widthPx');
      expect(src).toContain('sidebarRowStyle');
      expect(src).toContain('sidebarSurfaceStyle');
      expect(src).toContain('resolveActiveNavIndex');
      // no ad-hoc accent borders/rings on nav rows
      expect(src).not.toMatch(/border:\s*`1px solid \$\{ACCENT/);
      expect(src).not.toMatch(/ring-2 ring-\[/);
    }
  });


  it('keeps module accents separate (purple planning, orange warehouse)', () => {
    expect(PLANNING_ACCENT.base).not.toBe(WAREHOUSE_ACCENT.base);
    expect(PLANNING_ACCENT.base).toBe(MODULE_PALETTE.planning.base);
    expect(WAREHOUSE_ACCENT.base).toBe(MODULE_PALETTE.warehouse.base);
  });

  it('hides requested planning menu items from the sidebar', () => {
    const titles = planningNav.map((item) => item.title);
    expect(titles).not.toContain('Min sida');
    expect(titles).not.toContain('Logistikplanering');
    expect(titles).not.toContain('Transportplanering');
    expect(titles).not.toContain('Ekonomiöversikt');

    // Remaining top-level items still present
    expect(titles).toContain('Dashboard');
    expect(titles).toContain('Projekt');
    expect(titles).toContain('Planeringskalender');
    expect(titles).toContain('Personal');
  });

  it('exposes the planning calendar only once (not under Personal)', () => {
    const calendarLinks = planningNav.flatMap((item) => [
      ...(item.url === '/calendar' ? [item.title] : []),
      ...((item.children ?? []).filter((c: any) => c.url === '/calendar').map((c: any) => c.title)),
    ]);
    expect(calendarLinks).toEqual(['Planeringskalender']);
  });

});
