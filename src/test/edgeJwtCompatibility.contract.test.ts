import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('Edge JWT compatibility fallback', () => {
  it('staff-auth falls back to auth.getUser(token) when getClaims is unavailable', () => {
    const src = read('supabase/functions/_shared/staff-auth.ts');
    expect(src).toMatch(/typeof authApi\.getClaims === ["']function["']/);
    expect(src).toMatch(/userClient\.auth\.getUser\(token\)/);
  });

  it('mobile-app-api web JWT verification falls back to auth.getUser(jwt)', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');
    expect(src).toMatch(/async function resolveJwtUserId/);
    expect(src).toMatch(/verifier\.auth\.getUser\(jwt\)/);
  });

  it('get-project-time-summary accepts older auth clients via getUser fallback', () => {
    const src = read('supabase/functions/get-project-time-summary/index.ts');
    expect(src).toMatch(/async function resolveJwtUserId/);
    expect(src).toMatch(/supabase\.auth\.getUser\(token\)/);
  });
});