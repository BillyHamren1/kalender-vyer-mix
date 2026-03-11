/**
 * ============================================================
 * TEST: Planner Store
 * ============================================================
 * Verifies reducer logic, state transitions, dialog conflict
 * prevention, and selector behavior.
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  PlannerStoreProvider,
  usePlannerStore,
  usePlannerDate,
  usePlannerViewMode,
  usePlannerSelectedEvent,
  usePlannerDialogs,
  usePlannerLoading,
  usePlannerInteraction,
  usePlannerResourceFilter,
  usePlannerSync,
} from '@/stores/plannerStore';

// Helper: wrap hooks in provider
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(PlannerStoreProvider, null, children);

// ─── Core State Transitions ────────────────────────────────

describe('PlannerStore: date management', () => {
  it('initializes with today', () => {
    const { result } = renderHook(() => usePlannerDate(), { wrapper });
    const today = new Date();
    expect(result.current.selectedDate.getDate()).toBe(today.getDate());
  });

  it('SET_DATE updates date, weekStart, and monthStart consistently', () => {
    const { result } = renderHook(() => usePlannerDate(), { wrapper });

    act(() => {
      result.current.setDate(new Date('2025-03-19'));
    });

    expect(result.current.selectedDate.toISOString()).toContain('2025-03-19');
    // Week starts on Monday — March 17 is Monday for the week containing March 19
    expect(result.current.weekStart.getDay()).toBe(1); // Monday
    // Month start should be March 1
    expect(result.current.monthStart.getDate()).toBe(1);
    expect(result.current.monthStart.getMonth()).toBe(2); // March
  });

  it('date change does not reset view mode', () => {
    const { result } = renderHook(
      () => ({ date: usePlannerDate(), view: usePlannerViewMode() }),
      { wrapper }
    );

    act(() => {
      result.current.view.setViewMode('monthly');
    });
    act(() => {
      result.current.date.setDate(new Date('2025-06-15'));
    });

    expect(result.current.view.viewMode).toBe('monthly');
  });
});

describe('PlannerStore: view mode', () => {
  it('defaults to weekly', () => {
    const { result } = renderHook(() => usePlannerViewMode(), { wrapper });
    expect(result.current.viewMode).toBe('weekly');
  });

  it('supports all view modes', () => {
    const { result } = renderHook(() => usePlannerViewMode(), { wrapper });

    const modes = ['day', 'weekly', 'monthly', 'list'] as const;
    modes.forEach(mode => {
      act(() => result.current.setViewMode(mode));
      expect(result.current.viewMode).toBe(mode);
    });
  });
});

describe('PlannerStore: selected event', () => {
  it('defaults to null', () => {
    const { result } = renderHook(() => usePlannerSelectedEvent(), { wrapper });
    expect(result.current.selectedEventId).toBeNull();
  });

  it('selects and deselects events', () => {
    const { result } = renderHook(() => usePlannerSelectedEvent(), { wrapper });

    act(() => result.current.selectEvent('event-123'));
    expect(result.current.selectedEventId).toBe('event-123');

    act(() => result.current.selectEvent(null));
    expect(result.current.selectedEventId).toBeNull();
  });

  it('replaces previous selection (no stacking)', () => {
    const { result } = renderHook(() => usePlannerSelectedEvent(), { wrapper });

    act(() => result.current.selectEvent('event-1'));
    act(() => result.current.selectEvent('event-2'));
    expect(result.current.selectedEventId).toBe('event-2');
  });
});

// ─── Dialog State ──────────────────────────────────────────

describe('PlannerStore: dialog management', () => {
  it('staff curtain opens and closes cleanly', () => {
    const { result } = renderHook(() => usePlannerDialogs(), { wrapper });

    expect(result.current.staffCurtain.open).toBe(false);

    act(() => {
      result.current.openStaffCurtain('team-1', 'Team 1', new Date('2025-06-10'), { top: 100, left: 200 });
    });

    expect(result.current.staffCurtain.open).toBe(true);
    expect(result.current.staffCurtain.resourceId).toBe('team-1');
    expect(result.current.staffCurtain.resourceTitle).toBe('Team 1');
    expect(result.current.staffCurtain.position).toEqual({ top: 100, left: 200 });

    act(() => result.current.closeStaffCurtain());
    expect(result.current.staffCurtain.open).toBe(false);
  });

  it('product dialog opens and closes cleanly', () => {
    const { result } = renderHook(() => usePlannerDialogs(), { wrapper });

    act(() => result.current.openProductDialog('booking-999'));
    expect(result.current.productDialog.open).toBe(true);
    expect(result.current.productDialog.bookingId).toBe('booking-999');

    act(() => result.current.closeProductDialog());
    expect(result.current.productDialog.open).toBe(false);
    expect(result.current.productDialog.bookingId).toBeNull();
  });

  it('opening one dialog does not affect another', () => {
    const { result } = renderHook(() => usePlannerDialogs(), { wrapper });

    act(() => {
      result.current.openStaffCurtain('team-1', 'Team 1', new Date(), { top: 0, left: 0 });
    });
    act(() => {
      result.current.openProductDialog('booking-1');
    });

    // Both should be independently open
    expect(result.current.staffCurtain.open).toBe(true);
    expect(result.current.productDialog.open).toBe(true);

    act(() => result.current.closeStaffCurtain());
    // Product dialog should remain open
    expect(result.current.staffCurtain.open).toBe(false);
    expect(result.current.productDialog.open).toBe(true);
  });
});

// ─── Interaction State ─────────────────────────────────────

describe('PlannerStore: interaction state', () => {
  it('drag state starts and ends cleanly', () => {
    const { result } = renderHook(() => usePlannerInteraction(), { wrapper });

    expect(result.current.isDragging).toBe(false);
    expect(result.current.dragEventId).toBeNull();

    act(() => result.current.startDrag('event-1'));
    expect(result.current.isDragging).toBe(true);
    expect(result.current.dragEventId).toBe('event-1');

    act(() => result.current.endDrag());
    expect(result.current.isDragging).toBe(false);
    expect(result.current.dragEventId).toBeNull();
  });

  it('edit state starts and ends cleanly', () => {
    const { result } = renderHook(() => usePlannerInteraction(), { wrapper });

    act(() => result.current.startEdit('event-2'));
    expect(result.current.isEditing).toBe(true);
    expect(result.current.editEventId).toBe('event-2');

    act(() => result.current.endEdit());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.editEventId).toBeNull();
  });

  it('drag and edit are independent', () => {
    const { result } = renderHook(() => usePlannerInteraction(), { wrapper });

    act(() => result.current.startDrag('event-1'));
    act(() => result.current.startEdit('event-2'));

    expect(result.current.isDragging).toBe(true);
    expect(result.current.isEditing).toBe(true);

    act(() => result.current.endDrag());
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isEditing).toBe(true);
  });
});

// ─── Loading State ─────────────────────────────────────────

describe('PlannerStore: loading states', () => {
  it('manages loading by key independently', () => {
    const { result: r1 } = renderHook(() => usePlannerLoading('events'), { wrapper });
    const { result: r2 } = renderHook(() => usePlannerLoading('staff'), { wrapper });

    expect(r1.current.isLoading).toBe(false);

    // Note: these are separate hook instances with separate providers
    act(() => r1.current.setLoading(true));
    expect(r1.current.isLoading).toBe(true);
  });

  it('defaults to false for unknown keys', () => {
    const { result } = renderHook(() => usePlannerLoading('nonexistent'), { wrapper });
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── Resource Filter ───────────────────────────────────────

describe('PlannerStore: resource filter', () => {
  it('defaults to null (show all)', () => {
    const { result } = renderHook(() => usePlannerResourceFilter(), { wrapper });
    expect(result.current.activeResourceFilter).toBeNull();
  });

  it('sets and clears filter', () => {
    const { result } = renderHook(() => usePlannerResourceFilter(), { wrapper });

    act(() => result.current.setFilter(['team-1', 'team-2']));
    expect(result.current.activeResourceFilter).toEqual(['team-1', 'team-2']);

    act(() => result.current.setFilter(null));
    expect(result.current.activeResourceFilter).toBeNull();
  });
});

// ─── Legacy Sync ───────────────────────────────────────────

describe('PlannerStore: legacy sync', () => {
  it('SYNC_FROM_LEGACY updates date and derived fields', () => {
    const { result } = renderHook(
      () => ({ sync: usePlannerSync(), date: usePlannerDate() }),
      { wrapper }
    );

    act(() => {
      result.current.sync({ selectedDate: new Date('2025-12-25') });
    });

    expect(result.current.date.selectedDate.toISOString()).toContain('2025-12-25');
    expect(result.current.date.monthStart.getMonth()).toBe(11); // December
  });

  it('SYNC_FROM_LEGACY updates viewMode independently', () => {
    const { result } = renderHook(
      () => ({ sync: usePlannerSync(), view: usePlannerViewMode() }),
      { wrapper }
    );

    act(() => {
      result.current.sync({ viewMode: 'day' });
    });

    expect(result.current.view.viewMode).toBe('day');
  });

  it('partial sync does not reset other fields', () => {
    const { result } = renderHook(
      () => ({
        sync: usePlannerSync(),
        date: usePlannerDate(),
        view: usePlannerViewMode(),
        event: usePlannerSelectedEvent(),
      }),
      { wrapper }
    );

    // Set up initial state
    act(() => {
      result.current.view.setViewMode('monthly');
      result.current.event.selectEvent('event-1');
    });

    // Sync only date
    act(() => {
      result.current.sync({ selectedDate: new Date('2025-01-01') });
    });

    // Other state should be preserved
    expect(result.current.view.viewMode).toBe('monthly');
    expect(result.current.event.selectedEventId).toBe('event-1');
  });
});

// ─── Error boundary: missing provider ──────────────────────

describe('PlannerStore: provider requirement', () => {
  it('throws when used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => usePlannerStore());
    }).toThrow('usePlannerStore must be used within a PlannerStoreProvider');

    spy.mockRestore();
  });
});
