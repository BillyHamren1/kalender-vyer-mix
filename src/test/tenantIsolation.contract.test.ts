/**
 * Cross-tenant isolation contract.
 *
 * P0-regler:
 *  1. Ingen edge function får falla tillbaka på "första organisationen".
 *  2. Klientcachen måste rensas vid organisationsbyte.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  enforceTenantCacheBoundary,
  setLastKnownOrganizationId,
  getLastKnownOrganizationId,
  clearPersistedTenantState,
  RQ_PERSIST_KEY,
} from '@/lib/tenant/tenantCacheGuard';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase/functions');

const allFunctionSources = (): { file: string; src: string }[] => {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) out.push({ file: full, src: readFileSync(full, 'utf-8') });
    }
  };
  walk(FUNCTIONS_DIR);
  return out;
};

describe('P0 – ingen first-org fallback i edge functions', () => {
  it('inga anrop mot organizations med limit(1) som org-resolution', () => {
    const offenders = allFunctionSources().filter(({ file, src }) => {
      if (file.includes('_shared/tenantGuard.ts')) return false;
      const normalized = src.replace(/\s+/g, ' ');
      return /from\(['"]organizations['"]\)\s*\.select\([^)]*\)\s*\.limit\(1\)/.test(normalized);
    });
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('inga "falling back to first org"-varningar finns kvar', () => {
    const offenders = allFunctionSources().filter(({ src }) => /falling back to first org/i.test(src));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('mobile-app-api kastar när organization_id saknas', () => {
    const src = readFileSync(join(FUNCTIONS_DIR, 'mobile-app-api/index.ts'), 'utf-8');
    expect(src).toMatch(/fail-closed/i);
    expect(src).toMatch(/throw new Error\('organization_id saknas/);
  });
});

describe('P0 – tenant-isolerad klientcache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rensar persisterad cache när organisationen byts', () => {
    window.localStorage.setItem(RQ_PERSIST_KEY, JSON.stringify({ bookings: ['org-a'] }));
    setLastKnownOrganizationId('org-a');

    let cleared = false;
    const changed = enforceTenantCacheBoundary('org-b', () => {
      cleared = true;
    });

    expect(changed).toBe(true);
    expect(cleared).toBe(true);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
    expect(getLastKnownOrganizationId()).toBe('org-b');
  });

  it('rensar inte cachen när organisationen är oförändrad', () => {
    window.localStorage.setItem(RQ_PERSIST_KEY, 'data');
    setLastKnownOrganizationId('org-a');
    const changed = enforceTenantCacheBoundary('org-a', () => {
      throw new Error('får inte rensas');
    });
    expect(changed).toBe(false);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBe('data');
  });

  it('clearPersistedTenantState behåller auth men rensar tenant-data', () => {
    window.localStorage.setItem(RQ_PERSIST_KEY, 'x');
    window.localStorage.setItem('eventflow-planning-auth', 'session');
    window.localStorage.setItem('app_language', 'sv');
    window.localStorage.setItem('calendar-resources-v2', 'tenant-data');

    clearPersistedTenantState();

    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
    expect(window.localStorage.getItem('calendar-resources-v2')).toBeNull();
    expect(window.localStorage.getItem('eventflow-planning-auth')).toBe('session');
    expect(window.localStorage.getItem('app_language')).toBe('sv');
  });
});

// --- P0: SSO får aldrig återanvända föregående organisations context ---
describe('P0 – SSO tenant switch', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/hooks/useSsoListener.ts'), 'utf8');

  it('inkluderar organisationen i dedupe-fingerprinten', () => {
    expect(src).toMatch(/getTokenFingerprint\(ssoToken\.signature\)\}:\$\{requestedOrgId/);
  });

  it('rensar session och cache när HUB begär en annan organisation', () => {
    expect(src).toContain('isTenantSwitch');
    expect(src).toContain('clearPersistedTenantState()');
    expect(src).toContain('supabase.auth.signOut()');
  });

  it('sätter aktiv organisation från verifierat svar', () => {
    expect(src).toContain('setLastKnownOrganizationId(verifiedOrgId)');
  });
});
