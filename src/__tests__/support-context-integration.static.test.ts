// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('support-context integration contract', () => {
  it('mounts inside protected web auth and keeps the legacy alias protected', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('<OperationsSupportContextMount />');
    expect(app).toContain('<Route path="/project-planning" element={<Navigate to="/projects" replace />} />');
    expect(app.indexOf('<OperationsSupportContextMount />')).toBeGreaterThan(app.indexOf('<AuthProvider>'));
  });

  it('binds producer trust to parent SSO and clears it on signout', () => {
    const sso = read('src/hooks/useSsoListener.ts');
    const auth = read('src/contexts/AuthContext.tsx');
    const verifier = read('supabase/functions/verify-sso-token/index.ts');
    expect(sso).toContain('source: event.source');
    expect(sso).toContain('parentWindow: window.parent');
    expect(sso).toContain('const targetView = supportAttempt?.audience ?? getTargetView()');
    expect(sso).toContain("requestedOrgId ?? 'none'}:${targetView}");
    expect(auth).toContain('clearOperationsSupportContextSession();');
    expect(verifier).toContain('expected_module: expectedModule(targetView)');
    expect(verifier).toContain('// IMPORTANT: use Hub\'s revalidated payload');
  });

  it('registers only final ordinary project queries and the warehouse project row', () => {
    for (const path of [
      'src/pages/project/ProjectLayout.tsx',
      'src/pages/project/LargeProjectLayout.tsx',
      'src/pages/project/SimpleProjectWorkspacePage.tsx',
      'src/pages/WarehouseProjectDetail.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('useOperationsSupportContext({');
      expect(source).toContain('isFetching');
      expect(source).toContain('isError');
    }
  });

  it('authorizes responses from the live session, never the tenant cache', () => {
    const mount = read('src/components/support/OperationsSupportContextMount.tsx');
    expect(mount).toContain('session?.user.user_metadata?.organization_id');
    expect(mount).not.toContain('getLastKnownOrganizationId');
  });

  it('does not touch active packing or economy pages', () => {
    const workflow = read('.github/workflows/operations-support-context-gate.yml');
    expect(workflow).not.toContain('src/pages/PackingDetail.tsx');
    expect(workflow).not.toContain('src/pages/project/ProjectEconomyPage.tsx');
  });
});
