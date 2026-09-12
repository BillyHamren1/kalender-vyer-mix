import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_PALETTE } from '@/lib/layout/moduleAccents';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Operations premium module contract', () => {
  it('locks the exact approved Operations palette', () => {
    expect(MODULE_PALETTE.planning.baseHex).toBe('#9672BE');
    expect(MODULE_PALETTE.planning.darkHex).toBe('#5E428B');
    expect(MODULE_PALETTE.planning.base).toBe('hsl(268.4211 36.8932% 59.6078%)');
    expect(MODULE_PALETTE.planning.dark).toBe('hsl(263.0137 35.6098% 40.1961%)');

    const css = read('src/styles/module-accents.css');
    expect(css).toContain('265.7143 43.75% 93.7255%');
    expect(css).toContain('/* #EEE8F6 */');
  });

  it('locks the identical neutral canvas on app pages and authentication', () => {
    const index = read('src/index.css');
    const planning = read('src/styles/planning.css');
    const auth = read('src/pages/Auth.tsx');

    expect(index).toContain('--background: 200 20% 94.1176%');
    expect(index).toContain('--gradient-page: hsl(200 20% 94.1176%)');
    expect(planning).toContain('--background: 200 20% 94.1176%');
    expect(planning).toContain('--gradient-page: hsl(200 20% 94.1176%)');
    expect(auth).toContain("background: '#EDF1F3'");
  });

  it('uses one identical strong fill for icons and primary actions', () => {
    const css = read('src/styles/planning.css');
    expect(css).toContain('.operations-accent-gradient');
    expect(css).toContain('linear-gradient(145deg, hsl(var(--module-accent-base)), hsl(var(--module-accent)))');

    const button = read('src/components/ui/button.tsx');
    expect(button).toContain('default: "operations-accent-gradient');
    expect(button).toContain('active: "border');
  });

  it('locks the shared premium header geometry and larger icon', () => {
    const header = read('src/components/ui/PageHeader.tsx');
    expect(header).toContain("min-h-[98px]");
    expect(header).toContain("h-14 w-14");
    expect(header).toContain("h-[30px] w-[30px]");
    expect(header).toContain("w-1 rounded-r");
    expect(header).not.toContain('text-white leading-tight truncate');
  });

  it('applies the canonical header to every primary Operations route family', () => {
    for (const file of [
      'src/pages/PlanningDashboard.tsx',
      'src/pages/ProjectManagement.tsx',
      'src/pages/CustomCalendarPage.tsx',
      'src/pages/StaffManagement.tsx',
      'src/pages/StaffDashboard.tsx',
      'src/pages/EconomyOverview.tsx',
      'src/pages/OpsControlCenter.tsx',
      'src/pages/LogisticsHub.tsx',
      'src/pages/MyPage.tsx',
    ]) {
      expect(read(file), file).toContain('PageHeader');
    }
  });

  it('renames only the visible module identity and preserves internal contracts', () => {
    const auth = read('src/pages/Auth.tsx');
    const dashboard = read('src/pages/PlanningDashboard.tsx');
    expect(auth).toContain('EventFlow Operations');
    expect(auth).not.toContain('EventFlow Planering');
    expect(dashboard).toContain('title="Operations"');

    const routing = read('src/lib/layout/moduleAccents.ts');
    expect(routing).toContain("export type ModuleKey = 'planning' | 'warehouse'");
    expect(routing).toContain("return pathname === '/warehouse'");
  });

  it('does not change warehouse or semantic status palettes', () => {
    const css = read('src/styles/module-accents.css');
    expect(css).toContain("--module-accent: 32 71% 46%");
    expect(css).not.toMatch(/--destructive|--success|--warning/);
  });
});
