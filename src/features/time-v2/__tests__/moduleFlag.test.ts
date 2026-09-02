import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLocalOverrides,
  parseTenantAllowlist,
  readLocalOverrides,
  resolveTimeV2Flag,
  writeLocalOverride,
  LEGACY_TIME_ROUTE,
  TIME_V2_ROUTE,
} from '@/features/time-v2/lib/moduleFlag';

const ORG = 'f5e5cade-f08b-4833-a105-56461f15b191';
const OTHER = '11111111-2222-3333-4444-555555555555';

describe('Time V2 module flag', () => {
  beforeEach(() => clearLocalOverrides());

  it('defaults OFF for every existing tenant', () => {
    const s = resolveTimeV2Flag({ organizationId: ORG });
    expect(s.enabled).toBe(false);
    expect(s.source).toBe('default_off');
  });

  it('is OFF when no organization is resolved', () => {
    expect(resolveTimeV2Flag({ organizationId: null }).enabled).toBe(false);
  });

  it('turns ON only for the allowlisted tenant', () => {
    expect(resolveTimeV2Flag({ organizationId: ORG, allowlist: [ORG] }).enabled).toBe(true);
    expect(resolveTimeV2Flag({ organizationId: OTHER, allowlist: [ORG] }).enabled).toBe(false);
  });

  it('supports a reversible local test override', () => {
    const on = resolveTimeV2Flag({ organizationId: ORG, overrides: { [ORG]: true } });
    expect(on.enabled).toBe(true);
    expect(on.isTestOverride).toBe(true);

    const off = resolveTimeV2Flag({ organizationId: ORG, allowlist: [ORG], overrides: { [ORG]: false } });
    expect(off.enabled).toBe(false);
  });

  it('does not leak an override to another tenant', () => {
    expect(resolveTimeV2Flag({ organizationId: OTHER, overrides: { [ORG]: true } }).enabled).toBe(false);
  });

  it('persists and clears overrides locally only', () => {
    writeLocalOverride(ORG, true);
    expect(readLocalOverrides()[ORG]).toBe(true);
    writeLocalOverride(ORG, null);
    expect(readLocalOverrides()[ORG]).toBeUndefined();
  });

  it('parses the tenant allowlist env value', () => {
    expect(parseTenantAllowlist(` ${ORG}, ${OTHER} ,`)).toEqual([ORG, OTHER]);
    expect(parseTenantAllowlist(undefined)).toEqual([]);
  });

  it('keeps legacy Time as a separate route', () => {
    expect(LEGACY_TIME_ROUTE).toBe('/staff-management/time');
    expect(TIME_V2_ROUTE).toBe('/time-v2');
    expect(TIME_V2_ROUTE).not.toBe(LEGACY_TIME_ROUTE);
  });
});
