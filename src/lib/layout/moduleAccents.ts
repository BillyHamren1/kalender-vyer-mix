/**
 * Canonical EventFlow module palette (owned by EventFlow HUB).
 *
 * Planning  base #7357C8 / dark #6849BE
 * Lager     base #C77922 / dark #9A5715
 *
 * These values control MODULE IDENTITY only — active navigation, brand/icon,
 * focus ring and the primary module action. Neutral surfaces and semantic
 * success/warning/error colours are NOT part of the module accent.
 *
 * Locked by src/__tests__/moduleAccents.test.ts.
 */

export type ModuleKey = 'planning' | 'warehouse';

export interface ModulePalette {
  /** Canonical HUB hex — base identity colour. */
  baseHex: string;
  /** Canonical HUB hex — dark text/action variant. */
  darkHex: string;
  /** Same colours expressed as CSS hsl() for token usage. */
  base: string;
  dark: string;
  /** Very light tint used for active rows / soft surfaces. */
  soft: string;
  /** Discreet 1px accent border. */
  border: string;
  /** Faint hover tone. */
  hover: string;
  /** Focus-visible ring colour. */
  ring: string;
}

export const MODULE_PALETTE: Record<ModuleKey, ModulePalette> = {
  planning: {
    baseHex: '#7357C8',
    darkHex: '#6849BE',
    base: 'hsl(255 51% 56%)',
    dark: 'hsl(256 47% 52%)',
    soft: 'hsl(255 60% 97%)',
    border: 'hsl(255 40% 89%)',
    hover: 'hsl(255 50% 98%)',
    ring: 'hsl(255 51% 56%)',
  },
  warehouse: {
    baseHex: '#C77922',
    darkHex: '#9A5715',
    base: 'hsl(32 71% 46%)',
    dark: 'hsl(30 76% 34%)',
    soft: 'hsl(32 80% 96%)',
    border: 'hsl(32 55% 84%)',
    hover: 'hsl(32 70% 97%)',
    ring: 'hsl(32 71% 46%)',
  },
};

/**
 * Route/context aware module resolution. Both modules live in the same app,
 * so the accent must follow the route — never a hardcoded local fallback.
 */
export function resolveModuleFromPath(pathname: string): ModuleKey {
  return pathname === '/warehouse' || pathname.startsWith('/warehouse/')
    ? 'warehouse'
    : 'planning';
}
