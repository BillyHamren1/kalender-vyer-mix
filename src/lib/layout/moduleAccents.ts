/**
 * Canonical EventFlow module palette (owned by EventFlow HUB).
 *
 * Design standard 2026-10-18: ONE shared accent in all modules —
 * teal #1F747A (base) / deep teal #156065 (darker states).
 * Module identification happens via name, consistent line icons and
 * active navigation marking — never via per-module colours.
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

const SHARED_TEAL: ModulePalette = {
  baseHex: '#1F747A',
  darkHex: '#156065',
  base: 'hsl(183.956 59.4771% 30%)',
  dark: 'hsl(183.75 65.5738% 23.9216%)',
  soft: 'hsl(184 45% 94%)',
  border: 'hsl(184 30% 82%)',
  hover: 'hsl(184 40% 96%)',
  ring: 'hsl(183.956 59.4771% 30%)',
};

export const MODULE_PALETTE: Record<ModuleKey, ModulePalette> = {
  planning: SHARED_TEAL,
  warehouse: SHARED_TEAL,
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
