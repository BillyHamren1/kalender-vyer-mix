import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 't@e.se' },
    isLoading: false,
    signOut: vi.fn(),
    isSsoUser: false,
  }),
}));

const rolesState = { isLoading: true, roles: [] as string[] };
vi.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    roles: rolesState.roles,
    hasPlanningAccess: false,
    hasAnyRole: () => false,
    isLoading: rolesState.isLoading,
  }),
}));

import ProtectedRoute from '../ProtectedRoute';

describe('ProtectedRoute safety timer', () => {
  beforeEach(() => {
    rolesState.isLoading = true;
    rolesState.roles = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops showing "Laddar..." after 1.5s when roles hang', () => {
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>hemligt</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Laddar...')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(1600); });

    expect(screen.queryByText('Laddar...')).toBeNull();
    expect(screen.getByText('Inga roller tilldelade')).toBeTruthy();
  });
});
