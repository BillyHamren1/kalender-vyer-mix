import { describe, expect, it } from 'vitest';
import { getFallbackRolesFromUser } from '@/hooks/useUserRoles';

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