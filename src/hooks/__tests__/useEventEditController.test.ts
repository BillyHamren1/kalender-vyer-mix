/**
 * ============================================================
 * TEST: Event Edit Controller + Edit Helpers
 * ============================================================
 * Verifies mutex behavior, conflict prevention, validation,
 * booking field mapping, and dialog handler wrappers.
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEventEditController,
  createDialogHandlers,
  type EditMode,
} from '@/hooks/useEventEditController';
import {
  validateTimeRange,
  validateDate,
  getBookingFields,
  BOOKING_TIME_FIELDS,
  BOOKING_DATE_FIELDS,
  type EditableEvent,
} from '@/services/eventEditHelpers';

// ─── Test Data ─────────────────────────────────────────────

function makeEvent(overrides: Partial<EditableEvent> = {}): EditableEvent {
  return {
    id: 'event-1',
    title: 'Test Event',
    start: '2025-06-10T08:00:00.000Z',
    end: '2025-06-10T16:00:00.000Z',
    bookingId: 'booking-1',
    eventType: 'rig',
    ...overrides,
  };
}

// ─── useEventEditController: Mutex ─────────────────────────

describe('useEventEditController: mutex behavior', () => {
  it('starts with no active edit', () => {
    const { result } = renderHook(() => useEventEditController());
    expect(result.current.state.isEditing).toBe(false);
    expect(result.current.state.activeMode).toBeNull();
    expect(result.current.state.editingEvent).toBeNull();
  });

  it('grants first edit request', () => {
    const { result } = renderHook(() => useEventEditController());

    let granted: boolean;
    act(() => {
      granted = result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    expect(granted!).toBe(true);
    expect(result.current.state.isEditing).toBe(true);
    expect(result.current.state.activeMode).toBe('quickTime');
    expect(result.current.state.editingEvent?.id).toBe('event-1');
    expect(result.current.state.sessionId).toBeTruthy();
  });

  it('denies second edit request when one is active', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    let denied: boolean;
    act(() => {
      denied = result.current.requestEdit({ mode: 'moveDate', event: makeEvent({ id: 'event-2' }) });
    });

    expect(denied!).toBe(false);
    // Original edit should still be active
    expect(result.current.state.activeMode).toBe('quickTime');
    expect(result.current.state.editingEvent?.id).toBe('event-1');
  });

  it('allows force override of active edit', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    let granted: boolean;
    act(() => {
      granted = result.current.requestEdit(
        { mode: 'moveDate', event: makeEvent({ id: 'event-2' }) },
        true // force
      );
    });

    expect(granted!).toBe(true);
    expect(result.current.state.activeMode).toBe('moveDate');
    expect(result.current.state.editingEvent?.id).toBe('event-2');
  });

  it('endEdit resets all state', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'editTime', event: makeEvent() });
    });
    act(() => {
      result.current.endEdit();
    });

    expect(result.current.state.isEditing).toBe(false);
    expect(result.current.state.activeMode).toBeNull();
    expect(result.current.state.editingEvent).toBeNull();
    expect(result.current.state.sessionId).toBeNull();
  });

  it('allows new edit after endEdit', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });
    act(() => {
      result.current.endEdit();
    });

    let granted: boolean;
    act(() => {
      granted = result.current.requestEdit({ mode: 'moveDate', event: makeEvent({ id: 'event-3' }) });
    });

    expect(granted!).toBe(true);
    expect(result.current.state.activeMode).toBe('moveDate');
  });
});

// ─── useEventEditController: Query Methods ─────────────────

describe('useEventEditController: query methods', () => {
  it('canEdit returns true when no edit is active', () => {
    const { result } = renderHook(() => useEventEditController());
    expect(result.current.canEdit('quickTime')).toBe(true);
    expect(result.current.canEdit('moveDate')).toBe(true);
  });

  it('canEdit returns false for different mode when edit is active', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    expect(result.current.canEdit('quickTime')).toBe(true); // Same mode = OK
    expect(result.current.canEdit('moveDate')).toBe(false); // Different = blocked
  });

  it('isEventBeingEdited identifies the correct event', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent({ id: 'target' }) });
    });

    expect(result.current.isEventBeingEdited('target')).toBe(true);
    expect(result.current.isEventBeingEdited('other')).toBe(false);
  });

  it('isActiveMode matches correctly', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'editTime', event: makeEvent() });
    });

    expect(result.current.isActiveMode('editTime')).toBe(true);
    expect(result.current.isActiveMode('quickTime')).toBe(false);
  });
});

// ─── createDialogHandlers ──────────────────────────────────

describe('createDialogHandlers', () => {
  it('onOpen delegates to requestEdit', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      const handlers = createDialogHandlers(result.current, 'quickTime');
      const granted = handlers.onOpen(makeEvent());
      expect(granted).toBe(true);
    });
  });

  it('onClose only ends edit if mode matches', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    // Create handlers for a DIFFERENT mode and close — should NOT end quickTime
    act(() => {
      const moveDateHandlers = createDialogHandlers(result.current, 'moveDate');
      moveDateHandlers.onClose();
    });

    expect(result.current.state.isEditing).toBe(true);
    expect(result.current.state.activeMode).toBe('quickTime');
  });

  it('onClose ends edit when mode matches', () => {
    const { result } = renderHook(() => useEventEditController());

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    act(() => {
      const quickTimeHandlers = createDialogHandlers(result.current, 'quickTime');
      quickTimeHandlers.onClose();
    });

    expect(result.current.state.isEditing).toBe(false);
  });

  it('canOpen reflects current state', () => {
    const { result } = renderHook(() => useEventEditController());

    expect(createDialogHandlers(result.current, 'moveDate').canOpen()).toBe(true);

    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    expect(createDialogHandlers(result.current, 'moveDate').canOpen()).toBe(false);
  });
});

// ─── All edit modes are supported ──────────────────────────

describe('useEventEditController: all modes', () => {
  const modes: EditMode[] = ['quickTime', 'editTime', 'moveDate', 'addRigDay', 'duplicate', 'delete', 'custom'];

  modes.forEach(mode => {
    it(`supports mode: ${mode}`, () => {
      const { result } = renderHook(() => useEventEditController());

      let granted: boolean;
      act(() => {
        granted = result.current.requestEdit({ mode, event: makeEvent() });
      });

      expect(granted!).toBe(true);
      expect(result.current.state.activeMode).toBe(mode);
    });
  });
});

// ─── validateTimeRange ─────────────────────────────────────

describe('validateTimeRange', () => {
  const ref = new Date('2025-06-10T00:00:00Z');

  it('valid when end is after start', () => {
    expect(validateTimeRange('08:00', '16:00', ref).valid).toBe(true);
  });

  it('invalid when end equals start', () => {
    expect(validateTimeRange('10:00', '10:00', ref).valid).toBe(false);
  });

  it('invalid when end is before start', () => {
    const result = validateTimeRange('16:00', '08:00', ref);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── validateDate ──────────────────────────────────────────

describe('validateDate', () => {
  it('valid for ISO date string', () => {
    expect(validateDate('2025-06-10T00:00:00Z').valid).toBe(true);
  });

  it('invalid for garbage', () => {
    expect(validateDate('not-a-date').valid).toBe(false);
  });
});

// ─── getBookingFields ──────────────────────────────────────

describe('getBookingFields', () => {
  it('returns correct fields for rig', () => {
    const fields = getBookingFields('rig');
    expect(fields).toEqual({
      start: 'rig_start_time',
      end: 'rig_end_time',
      date: 'rigdaydate',
    });
  });

  it('returns correct fields for event', () => {
    const fields = getBookingFields('event');
    expect(fields).toEqual({
      start: 'event_start_time',
      end: 'event_end_time',
      date: 'eventdate',
    });
  });

  it('returns correct fields for rigDown', () => {
    const fields = getBookingFields('rigDown');
    expect(fields).toEqual({
      start: 'rigdown_start_time',
      end: 'rigdown_end_time',
      date: 'rigdowndate',
    });
  });

  it('returns null for unknown type', () => {
    expect(getBookingFields('packing')).toBeNull();
    expect(getBookingFields(undefined)).toBeNull();
  });

  it('BOOKING_TIME_FIELDS covers all planning types', () => {
    expect(Object.keys(BOOKING_TIME_FIELDS)).toEqual(['rig', 'event', 'rigDown']);
  });

  it('BOOKING_DATE_FIELDS covers all planning types', () => {
    expect(Object.keys(BOOKING_DATE_FIELDS)).toEqual(['rig', 'event', 'rigDown']);
  });
});

// ─── Stress Tests: Rapid Sequential Operations ─────────────

describe('useEventEditController: stress tests', () => {
  it('handles rapid requestEdit/endEdit cycles correctly', () => {
    const { result } = renderHook(() => useEventEditController());

    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current.requestEdit({ mode: 'quickTime', event: makeEvent({ id: `ev-${i}` }) });
      });
      act(() => {
        result.current.endEdit();
      });
    }

    // Should be clean after all cycles
    expect(result.current.state.isEditing).toBe(false);
    expect(result.current.state.activeMode).toBeNull();
    expect(result.current.state.editingEvent).toBeNull();
  });

  it('final state is correct after rapid mode switches', () => {
    const { result } = renderHook(() => useEventEditController());
    const modes: EditMode[] = ['quickTime', 'editTime', 'moveDate', 'addRigDay', 'duplicate', 'delete'];

    // Start one edit, then try to force-override rapidly
    act(() => {
      result.current.requestEdit({ mode: 'quickTime', event: makeEvent() });
    });

    modes.forEach((mode, i) => {
      act(() => {
        result.current.requestEdit({ mode, event: makeEvent({ id: `ev-${i}` }) }, true);
      });
    });

    expect(result.current.state.isEditing).toBe(true);
    expect(result.current.state.activeMode).toBe('delete');
  });

  it('handles null/undefined-like event gracefully', () => {
    const { result } = renderHook(() => useEventEditController());

    // Event with minimal data
    let granted: boolean;
    act(() => {
      granted = result.current.requestEdit({
        mode: 'quickTime',
        event: { id: '', title: '', start: '', end: '', bookingId: '', eventType: '' },
      });
    });

    // Should still grant (controller doesn't validate event content)
    expect(granted!).toBe(true);
    expect(result.current.state.isEditing).toBe(true);
  });

  it('endEdit is idempotent', () => {
    const { result } = renderHook(() => useEventEditController());

    // End without starting — should be safe
    act(() => result.current.endEdit());
    act(() => result.current.endEdit());
    act(() => result.current.endEdit());

    expect(result.current.state.isEditing).toBe(false);
  });
});
