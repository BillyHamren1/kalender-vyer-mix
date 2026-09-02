/**
 * Time V2 module flag — reversible, tenant-scoped, OFF by default.
 *
 * Rules (locked by src/features/time-v2/__tests__/moduleFlag.test.ts):
 *  - No tenant gets Time V2 unless explicitly allowlisted or locally overridden.
 *  - Legacy Time stays the default path; this flag never redirects anything.
 *  - The local override is a client-only test fixture. It never writes to any
 *    production table and never touches identities, accounts or sessions.
 */

export const TIME_V2_FLAG_STORAGE_KEY = 'eventflow.time-v2.module-flag.v1';

export type TimeV2FlagSource =
  | 'default_off'
  | 'tenant_allowlist'
  | 'local_test_override';

export interface TimeV2FlagState {
  enabled: boolean;
  source: TimeV2FlagSource;
  /** True when the flag is on purely because of a local (synthetic) override. */
  isTestOverride: boolean;
  organizationId: string | null;
  reason: string;
}

export interface ResolveTimeV2FlagInput {
  organizationId: string | null;
  /** Tenant ids allowlisted at build time (VITE_TIME_V2_TENANTS). */
  allowlist?: readonly string[];
  /** Local per-tenant overrides (test fixture only). */
  overrides?: Readonly<Record<string, boolean>>;
}

const norm = (v: string) => v.trim().toLowerCase();

export function parseTenantAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => norm(s))
    .filter(Boolean);
}

export function resolveTimeV2Flag({
  organizationId,
  allowlist = [],
  overrides = {},
}: ResolveTimeV2FlagInput): TimeV2FlagState {
  const base: Omit<TimeV2FlagState, 'enabled' | 'source' | 'isTestOverride' | 'reason'> = {
    organizationId: organizationId ?? null,
  };

  if (!organizationId) {
    return {
      ...base,
      enabled: false,
      source: 'default_off',
      isTestOverride: false,
      reason: 'Ingen organisation upplöst — modulen är avstängd.',
    };
  }

  const key = norm(organizationId);
  const override = Object.entries(overrides).find(([k]) => norm(k) === key)?.[1];

  if (override === true) {
    return {
      ...base,
      enabled: true,
      source: 'local_test_override',
      isTestOverride: true,
      reason: 'Lokal testflagga påslagen för denna organisation.',
    };
  }

  if (override === false) {
    return {
      ...base,
      enabled: false,
      source: 'default_off',
      isTestOverride: false,
      reason: 'Lokal testflagga uttryckligen avstängd.',
    };
  }

  if (allowlist.some((t) => norm(t) === key)) {
    return {
      ...base,
      enabled: true,
      source: 'tenant_allowlist',
      isTestOverride: false,
      reason: 'Organisationen finns i tenant-allowlisten.',
    };
  }

  return {
    ...base,
    enabled: false,
    source: 'default_off',
    isTestOverride: false,
    reason: 'Time V2 är avstängd som standard. Legacy Tid & Lön gäller.',
  };
}

/* ---------------- local override storage (test fixture only) -------------- */

export function readLocalOverrides(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TIME_V2_FLAG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLocalOverride(organizationId: string, enabled: boolean | null): void {
  if (typeof window === 'undefined' || !organizationId) return;
  const current = readLocalOverrides();
  if (enabled === null) delete current[organizationId];
  else current[organizationId] = enabled;
  try {
    window.localStorage.setItem(TIME_V2_FLAG_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('eventflow:time-v2-flag-changed'));
  } catch {
    /* ignore */
  }
}

export function clearLocalOverrides(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TIME_V2_FLAG_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('eventflow:time-v2-flag-changed'));
  } catch {
    /* ignore */
  }
}

export const TIME_V2_ROUTE = '/time-v2';
export const TIME_V2_FIXTURE_ROUTE = '/dev/time-v2-flag';
export const LEGACY_TIME_ROUTE = '/staff-management/time';
