import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useSmartBack } from '../useSmartBack';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const wrapperWithState = (state: any = null) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[{ pathname: '/x', state }]}>
      {children}
    </MemoryRouter>
  );
};

describe('useSmartBack', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    // jsdom: history har 1 entry & ingen referrer => fallback ska väljas.
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('navigerar till state.from när det finns', () => {
    const { result } = renderHook(() => useSmartBack('/fallback'), {
      wrapper: wrapperWithState({ from: '/projekt/123' }),
    });
    act(() => result.current());
    expect(navigateMock).toHaveBeenCalledWith('/projekt/123');
  });

  it('faller tillbaka till fallback när varken state.from eller intern referrer finns', () => {
    const { result } = renderHook(() => useSmartBack('/fallback'), {
      wrapper: wrapperWithState(null),
    });
    act(() => result.current());
    expect(navigateMock).toHaveBeenCalledWith('/fallback');
  });

  it('går history.back när same-origin referrer + längre history finns', () => {
    Object.defineProperty(document, 'referrer', {
      value: window.location.origin + '/nagonting',
      configurable: true,
    });
    Object.defineProperty(window.history, 'length', { value: 5, configurable: true });
    const { result } = renderHook(() => useSmartBack('/fallback'), {
      wrapper: wrapperWithState(null),
    });
    act(() => result.current());
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });
});
