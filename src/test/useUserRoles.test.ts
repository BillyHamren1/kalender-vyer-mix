import { describe, expect, it } from 'vitest';
import { getFallbackRolesFromUser, ROLE_FETCH_TIMEOUT_MS } from '@/hooks/useUserRoles';

describe('ROLE_FETCH_TIMEOUT_MS', () => {
  it('stays at or below 2000 ms so ProtectedRoute never hangs', () => {
    expect(ROLE_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });
});

describe('getFallbackRolesFromUser', () => {
  it('reads valid roles from user metadata', () => {
    expect(getFallbackRolesFromUser({ user_metadata: { roles: ['admin', 'projekt'] } } as any)).toEqual(['admin', 'projekt']);
  });

  it('ignores unknown roles and duplicates', () => {
    expect(getFallbackRolesFromUser({ user_metadata: { roles: ['admin', 'foo', 'admin', 'lager'] } } as any)).toEqual(['admin', 'lager']);
  });

  it('falls back to singular role field', () => {
    expect(getFallbackRolesFromUser({ user_metadata: { role: 'forsaljning' } } as any)).toEqual(['forsaljning']);
  });

  it('returns empty array when metadata lacks app roles', () => {
    expect(getFallbackRolesFromUser({ user_metadata: { role: 'foo' } } as any)).toEqual([]);
    expect(getFallbackRolesFromUser(null)).toEqual([]);
  });
});