import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Time V2 module routing & boundaries', () => {
  const app = read('src/App.tsx');

  it('registers the separate Time V2 route', () => {
    expect(app).toContain('path="/time-v2"');
    expect(app).toContain('path="/dev/time-v2-flag"');
  });

  it('leaves every legacy Time route untouched and default', () => {
    for (const r of [
      '/staff-management/time',
      '/staff-management/time-approvals',
      '/staff-management/time-approvals-legacy',
      '/staff-management/time-reports',
      '/admin/time-review',
    ]) {
      expect(app).toContain(`path="${r}"`);
    }
    // No automatic redirect/cutover from legacy Time to V2.
    expect(app).not.toMatch(/path="\/staff-management\/time"[^>]*Navigate[^>]*time-v2/);
  });

  it('keeps the Time client read-only and bound to the real adapter operations', () => {
    const client = read('src/features/time-v2/lib/client.ts');
    // Reads only — every write lives in commands.ts / personnelClient.ts.
    expect(client).toContain('callTimeBoundary');
    expect(client).not.toMatch(/TIME_OPERATIONS\.(attest|requestCorrection|activation|setAppAccess)/);
    // No invented cross-origin Time endpoints from the browser.
    expect(client).not.toContain('/api/time/');
  });

  it('never calls Time cross-origin from the browser and never holds a Time credential', () => {
    const boundary = read('src/features/time-v2/lib/boundary.ts');
    expect(boundary).toContain("supabase.functions.invoke(TIME_PROXY_FUNCTION");
    expect(boundary).not.toMatch(/service_role|apikey|SYSTEM_TOKEN/);
    const proxy = read('supabase/functions/time-planning-proxy/index.ts');
    expect(proxy).toContain('time-planning-adapter');
    expect(proxy).toContain('assertPlanningAccess');
  });

  it('never reads Time or Planning source tables directly from the module', () => {
    for (const f of [
      'src/features/time-v2/lib/client.ts',
      'src/features/time-v2/lib/contract.ts',
      'src/features/time-v2/pages/TimeV2ModulePage.tsx',
      'src/features/time-v2/hooks/useTimeV2Overview.ts',
    ]) {
      const src = read(f);
      expect(src).not.toContain('supabase.from(');
      expect(src).not.toContain('@/integrations/supabase/client');
    }
  });

  it('does not copy credentials, tokens or sessions', () => {
    const src =
      read('src/features/time-v2/lib/client.ts') +
      read('src/features/time-v2/lib/moduleFlag.ts') +
      read('src/features/time-v2/pages/TimeV2FlagFixturePage.tsx');
    expect(src).not.toMatch(/password|access_token|refresh_token|service_role/i);
  });
});
