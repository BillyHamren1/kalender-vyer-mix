import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Tenant-regression: Planning får aldrig falla tillbaka på en default-organisation
 * (historiskt Frans August) i runtime-kod. Organisationen ska alltid härledas
 * från den inloggade sessionen (HUB/SSO → profiles.organization_id) eller från
 * en explicit, fail-closed allowlist.
 */

const FA_ORG = 'f5e5cade-f08b-4833-a105-56461f15b191';
const ROOT = path.resolve(__dirname, '../..');

/** Explicit, fail-closed org-bindning (ingen fallback) — tillåten. */
const ALLOWLIST = new Set<string>([
  'supabase/functions/_shared/time-v2/lagerContextExport.ts',
]);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '__tests__', 'dist', '.git'].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const runtimeFiles = () =>
  [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'supabase/functions'))]
    .filter((f) => !f.includes('/types.ts'))
    .map((f) => path.relative(ROOT, f));

describe('tenant scope: no default organization fallback', () => {
  it('does not hardcode the Frans August organization id in runtime code', () => {
    const offenders = runtimeFiles().filter((rel) => {
      if (ALLOWLIST.has(rel)) return false;
      return fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(FA_ORG);
    });
    expect(offenders).toEqual([]);
  });

  it('day-evidence diagnostics resolves the organization from the caller, never from a constant', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/debug-day-evidence-l1-report/index.ts'),
      'utf8',
    );
    expect(src).not.toContain(FA_ORG);
    expect(src).not.toMatch(/body\?\.organizationId \?\?/);
    expect(src).toContain("auth.getUser(token)");
    expect(src).toContain("cross_tenant_request_rejected");
    expect(src).toContain("organization_not_resolved");
  });

  it('day-evidence diagnostics requires a verified JWT', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
    const section = cfg.split('[functions.debug-day-evidence-l1-report]')[1] ?? '';
    expect(section.split('[')[0]).toContain('verify_jwt = true');
  });
});
