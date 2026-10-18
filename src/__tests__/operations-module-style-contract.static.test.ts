import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_PALETTE } from '@/lib/layout/moduleAccents';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Operations premium module contract', () => {
  it('locks the exact approved shared teal palette (standard 2026-10-18)', () => {
    expect(MODULE_PALETTE.planning.baseHex).toBe('#1F747A');
    expect(MODULE_PALETTE.planning.darkHex).toBe('#156065');
    expect(MODULE_PALETTE.planning.base).toBe('hsl(183.956 59.4771% 30%)');
    expect(MODULE_PALETTE.planning.dark).toBe('hsl(183.75 65.5738% 23.9216%)');

    const css = read('src/styles/module-accents.css');
    expect(css).toContain('--planning-selection: 183.956 59.4771% 30%; /* #1F747A */');
    expect(css).toContain('--planning-selection-deep: 183.75 65.5738% 23.9216%; /* #156065 */');
  });

  it('locks the identical neutral canvas on app pages and authentication', () => {
    const index = read('src/index.css');
    const planning = read('src/styles/planning.css');
    const auth = read('src/pages/Auth.tsx');

    expect(index).toContain('--background: 200 20% 94.1176%');
    expect(index).toContain('--gradient-page: hsl(200 20% 94.1176%)');
    expect(planning).toContain('--background: 200 20% 94.1176%');
    expect(planning).toContain('--gradient-page: hsl(200 20% 94.1176%)');
    expect(auth).toContain("theme-purple bg-background");
  });

  it('keeps explicit gradient variants separate from neutral default actions', () => {
    const button = read('src/components/ui/button.tsx');
    expect(button).toContain('default: "operations-primary-action bg-action text-action-foreground hover:bg-action-hover');
    expect(button).toContain('gradient: "operations-accent-gradient');
    expect(button).toContain('active: "border');
  });

  it('shares the 2A identity tile without repainting whole headers or tabs', () => {
    const header = read('src/components/ui/PageHeader.tsx');
    const css = read('src/styles/planning.css');
    expect(header).toContain('<ModuleIcon icon={Icon}');
    expect(header).not.toContain('radial-gradient');
    expect(css).toContain('.operations-module-cube');
    expect(css).toContain(".theme-purple .operations-tab-luster[data-state='active']");
    expect(css).toContain('background-image: none');
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

  it('uses the same canonical premium header on authentication and exposes the Operations title', () => {
    const auth = read('src/pages/Auth.tsx');
    const theme = read('src/hooks/useModuleTheme.ts');

    expect(auth).toContain('<PageHeader');
    expect(auth).toContain('variant="purple"');
    expect(auth).not.toContain('h-16 w-16');
    expect(auth).not.toContain('h-9 w-9');
    expect(theme).toContain("document.title = 'EventFlow Operations'");
    expect(theme).toContain("!pathname.startsWith('/m/')");
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

  it('uses the shared teal accent in warehouse too and keeps semantic status palettes', () => {
    const css = read('src/styles/module-accents.css');
    expect(css).toContain("--module-accent: 183.956 59.4771% 30%");
    expect(css).not.toMatch(/--destructive|--success|--warning/);
  });
});
