import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getFallbackRolesFromUser, ROLE_FETCH_TIMEOUT_MS } from '@/hooks/useUserRoles';

const mockUseAuth = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

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

describe('useUserRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u1',
        user_metadata: {
          roles: ['admin', 'projekt'],
        },
      },
    });
    eqMock.mockResolvedValue({ data: [{ role: 'lager' }], error: null });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });
  });

  it('uses session fallback roles immediately without blocking UI while user_roles still loads', async () => {
    const { useUserRoles } = await import('@/hooks/useUserRoles');

    const { result } = renderHook(() => useUserRoles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.roles).toEqual(['admin', 'projekt']);
    expect(fromMock).toHaveBeenCalledWith('user_roles');
    expect(result.current.hasPlanningAccess).toBe(true);
  });
});