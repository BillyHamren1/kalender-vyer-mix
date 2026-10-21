import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MOBILE_BAR, mobileBottomBarStyle, mobileTopBarStyle } from '@/lib/layout/mobileBars';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('canonical EventFlow mobile bars (standard 2026-10-18)', () => {
  it('locks the shared black bar tokens', () => {
    expect(MOBILE_BAR.background).toBe('hsl(210 6% 8%)');
    expect(MOBILE_BAR.active).toBe('hsl(0 0% 100%)');
    expect(MOBILE_BAR.inactive).toBe('hsl(210 10% 88%)');
  });

  it('locks the HUB dark-surface fix: bright teal marker, near-white inactive text', () => {
    // HUB commit abab70a: base teal #1F747A disappears on black — the
    // active marker/indicator uses the bright variant instead.
    expect(MOBILE_BAR.bright).toBe('#4DC3CB');
    expect(MOBILE_BAR.activeMarker).toBe(MOBILE_BAR.bright);
    expect(MOBILE_BAR.activeMarker).not.toBe('#1F747A');
  });

  it('renders a solid black bar without blur or gradient', () => {
    const bottom = mobileBottomBarStyle();
    expect(bottom.background).toBe(MOBILE_BAR.background);
    expect(bottom.boxShadow).toBe('none');
    expect(String(bottom.borderTop)).toContain(MOBILE_BAR.divider);
    expect(mobileTopBarStyle().background).toBe(MOBILE_BAR.background);
  });

  it('is used by the shared mobile shells instead of teal/blur bars', () => {
    const bottomNav = read('src/components/mobile-app/MobileBottomNav.tsx');
    expect(bottomNav).toContain('mobileBottomBarStyle');
    expect(bottomNav).not.toContain('backdrop-blur');

    const header = read('src/components/mobile-app/MobileHeader.tsx');
    expect(header).toContain('mobileTopBarStyle');
    expect(header).not.toContain('linear-gradient');

    for (const file of [
      'src/components/mobile-app/MobileAppLayout.tsx',
      'src/shells/time/TimeAppLayout.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('mobileBars');
      expect(src).not.toContain("backgroundColor = 'hsl(var(--primary))'");
    }
  });

  it('labels the warehouse start page Översikt (URL unchanged)', () => {
    const src = read('src/components/WarehouseSidebar3D.tsx');
    expect(src).toContain('{ title: "Översikt", url: "/warehouse"');
    expect(src).not.toContain('Lager OPS');
    expect(src).toContain('mobileBottomBarStyle');
  });
});
