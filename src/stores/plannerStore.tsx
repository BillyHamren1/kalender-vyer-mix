/**
 * ============================================================
 * PLANNER STORE — Central State Container
 * ============================================================
 * 
 * Single source of truth for Planner-related UI state.
 * Uses React Context + useReducer for predictable state updates
 * without adding external dependencies.
 * 
 * MIGRATION STATUS:
 *   ✅ selectedDate — centralized (was duplicated across pages)
 *   ✅ viewMode — centralized (was duplicated across pages)  
 *   ✅ selectedEvent — centralized (was local to components)
 *   ✅ activeResourceFilter — centralized
 *   ✅ dialogState — centralized (staff curtain, product dialog)
 *   ✅ loadingStates — centralized
 *   ✅ interactionState — drag/edit tracking
 *   🔄 events — still owned by source hooks (useRealTimeCalendarEvents, etc.)
 * 
 * IMPORTANT: This store coexists with legacy state. Components can
 * gradually migrate by reading from the store while keeping their
 * local state as fallback. The store dispatches are additive — they
 * don't break existing prop flows.
 * ============================================================
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
} from 'react';
import { startOfWeek, startOfMonth } from 'date-fns';

// ─── State Shape ───────────────────────────────────────────

export type PlannerViewMode = 'day' | 'weekly' | 'monthly' | 'list';

export interface PlannerDialogState {
  /** Staff selection curtain */
  staffCurtain: {
    open: boolean;
    resourceId: string | null;
    resourceTitle: string;
    targetDate: Date | null;
    position: { top: number; left: number };
  };
  /** Booking products dialog */
  productDialog: {
    open: boolean;
    bookingId: string | null;
  };
  /** Generic dialog (extensible for future dialogs) */
  generic: {
    open: boolean;
    dialogId: string | null;
    data: Record<string, unknown>;
  };
}

export interface PlannerInteractionState {
  /** Currently dragging an event */
  isDragging: boolean;
  dragEventId: string | null;
  /** Currently editing an event time */
  isEditing: boolean;
  editEventId: string | null;
}

export interface PlannerState {
  /** The currently selected/focused date */
  selectedDate: Date;
  /** Start of the current week (derived, but cached for performance) */
  weekStart: Date;
  /** Start of the current month */
  monthStart: Date;
  /** Current view mode */
  viewMode: PlannerViewMode;
  /** Currently selected/focused event ID */
  selectedEventId: string | null;
  /** Active resource/team filter (null = show all) */
  activeResourceFilter: string[] | null;
  /** Dialog/popover state */
  dialogs: PlannerDialogState;
  /** Loading states by key */
  loading: Record<string, boolean>;
  /** Interaction state (drag, edit) */
  interaction: PlannerInteractionState;
  /** Last navigation path (for back-nav) */
  lastPath: string;
}

const createInitialState = (): PlannerState => ({
  selectedDate: new Date(),
  weekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
  monthStart: startOfMonth(new Date()),
  viewMode: 'weekly',
  selectedEventId: null,
  activeResourceFilter: null,
  dialogs: {
    staffCurtain: {
      open: false,
      resourceId: null,
      resourceTitle: '',
      targetDate: null,
      position: { top: 0, left: 0 },
    },
    productDialog: {
      open: false,
      bookingId: null,
    },
    generic: {
      open: false,
      dialogId: null,
      data: {},
    },
  },
  loading: {},
  interaction: {
    isDragging: false,
    dragEventId: null,
    isEditing: false,
    editEventId: null,
  },
  lastPath: '',
});

// ─── Actions ───────────────────────────────────────────────

export type PlannerAction =
  | { type: 'SET_DATE'; date: Date }
  | { type: 'SET_VIEW_MODE'; mode: PlannerViewMode }
  | { type: 'SELECT_EVENT'; eventId: string | null }
  | { type: 'SET_RESOURCE_FILTER'; resourceIds: string[] | null }
  | { type: 'OPEN_STAFF_CURTAIN'; resourceId: string; resourceTitle: string; targetDate: Date; position: { top: number; left: number } }
  | { type: 'CLOSE_STAFF_CURTAIN' }
  | { type: 'OPEN_PRODUCT_DIALOG'; bookingId: string }
  | { type: 'CLOSE_PRODUCT_DIALOG' }
  | { type: 'OPEN_DIALOG'; dialogId: string; data?: Record<string, unknown> }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SET_LOADING'; key: string; loading: boolean }
  | { type: 'START_DRAG'; eventId: string }
  | { type: 'END_DRAG' }
  | { type: 'START_EDIT'; eventId: string }
  | { type: 'END_EDIT' }
  | { type: 'SET_LAST_PATH'; path: string }
  | { type: 'SYNC_FROM_LEGACY'; partial: Partial<Pick<PlannerState, 'selectedDate' | 'viewMode' | 'lastPath'>> };

// ─── Reducer ───────────────────────────────────────────────

function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'SET_DATE': {
      const date = action.date;
      return {
        ...state,
        selectedDate: date,
        weekStart: startOfWeek(date, { weekStartsOn: 1 }),
        monthStart: startOfMonth(date),
      };
    }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };

    case 'SELECT_EVENT':
      return { ...state, selectedEventId: action.eventId };

    case 'SET_RESOURCE_FILTER':
      return { ...state, activeResourceFilter: action.resourceIds };

    case 'OPEN_STAFF_CURTAIN':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          staffCurtain: {
            open: true,
            resourceId: action.resourceId,
            resourceTitle: action.resourceTitle,
            targetDate: action.targetDate,
            position: action.position,
          },
        },
      };

    case 'CLOSE_STAFF_CURTAIN':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          staffCurtain: {
            ...state.dialogs.staffCurtain,
            open: false,
          },
        },
      };

    case 'OPEN_PRODUCT_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          productDialog: { open: true, bookingId: action.bookingId },
        },
      };

    case 'CLOSE_PRODUCT_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          productDialog: { open: false, bookingId: null },
        },
      };

    case 'OPEN_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          generic: { open: true, dialogId: action.dialogId, data: action.data || {} },
        },
      };

    case 'CLOSE_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          generic: { open: false, dialogId: null, data: {} },
        },
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.key]: action.loading },
      };

    case 'START_DRAG':
      return {
        ...state,
        interaction: { ...state.interaction, isDragging: true, dragEventId: action.eventId },
      };

    case 'END_DRAG':
      return {
        ...state,
        interaction: { ...state.interaction, isDragging: false, dragEventId: null },
      };

    case 'START_EDIT':
      return {
        ...state,
        interaction: { ...state.interaction, isEditing: true, editEventId: action.eventId },
      };

    case 'END_EDIT':
      return {
        ...state,
        interaction: { ...state.interaction, isEditing: false, editEventId: null },
      };

    case 'SET_LAST_PATH':
      return { ...state, lastPath: action.path };

    case 'SYNC_FROM_LEGACY': {
      const updates: Partial<PlannerState> = {};
      if (action.partial.selectedDate) {
        updates.selectedDate = action.partial.selectedDate;
        updates.weekStart = startOfWeek(action.partial.selectedDate, { weekStartsOn: 1 });
        updates.monthStart = startOfMonth(action.partial.selectedDate);
      }
      if (action.partial.viewMode) {
        updates.viewMode = action.partial.viewMode;
      }
      if (action.partial.lastPath !== undefined) {
        updates.lastPath = action.partial.lastPath;
      }
      return { ...state, ...updates };
    }

    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────

interface PlannerStoreContextValue {
  state: PlannerState;
  dispatch: Dispatch<PlannerAction>;
}

const PlannerStoreContext = createContext<PlannerStoreContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────

export const PlannerStoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(plannerReducer, undefined, createInitialState);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <PlannerStoreContext.Provider value={value}>
      {children}
    </PlannerStoreContext.Provider>
  );
};

// ─── Hook: Raw access ──────────────────────────────────────

/**
 * Low-level access to the planner store.
 * Prefer the selector hooks below to minimize re-renders.
 */
export function usePlannerStore() {
  const ctx = useContext(PlannerStoreContext);
  if (!ctx) {
    throw new Error('usePlannerStore must be used within a PlannerStoreProvider');
  }
  return ctx;
}

// ─── Selector Hooks (minimize re-renders) ──────────────────

/**
 * Returns only the selected date and derived week/month starts.
 * Re-renders only when date changes.
 */
export function usePlannerDate() {
  const { state, dispatch } = usePlannerStore();
  const setDate = useCallback(
    (date: Date) => dispatch({ type: 'SET_DATE', date }),
    [dispatch]
  );
  return {
    selectedDate: state.selectedDate,
    weekStart: state.weekStart,
    monthStart: state.monthStart,
    setDate,
  };
}

/**
 * Returns the current view mode.
 */
export function usePlannerViewMode() {
  const { state, dispatch } = usePlannerStore();
  const setViewMode = useCallback(
    (mode: PlannerViewMode) => dispatch({ type: 'SET_VIEW_MODE', mode }),
    [dispatch]
  );
  return { viewMode: state.viewMode, setViewMode };
}

/**
 * Returns the selected event state.
 */
export function usePlannerSelectedEvent() {
  const { state, dispatch } = usePlannerStore();
  const selectEvent = useCallback(
    (eventId: string | null) => dispatch({ type: 'SELECT_EVENT', eventId }),
    [dispatch]
  );
  return { selectedEventId: state.selectedEventId, selectEvent };
}

/**
 * Returns dialog states and control functions.
 */
export function usePlannerDialogs() {
  const { state, dispatch } = usePlannerStore();

  const openStaffCurtain = useCallback(
    (resourceId: string, resourceTitle: string, targetDate: Date, position: { top: number; left: number }) =>
      dispatch({ type: 'OPEN_STAFF_CURTAIN', resourceId, resourceTitle, targetDate, position }),
    [dispatch]
  );

  const closeStaffCurtain = useCallback(
    () => dispatch({ type: 'CLOSE_STAFF_CURTAIN' }),
    [dispatch]
  );

  const openProductDialog = useCallback(
    (bookingId: string) => dispatch({ type: 'OPEN_PRODUCT_DIALOG', bookingId }),
    [dispatch]
  );

  const closeProductDialog = useCallback(
    () => dispatch({ type: 'CLOSE_PRODUCT_DIALOG' }),
    [dispatch]
  );

  return {
    staffCurtain: state.dialogs.staffCurtain,
    productDialog: state.dialogs.productDialog,
    genericDialog: state.dialogs.generic,
    openStaffCurtain,
    closeStaffCurtain,
    openProductDialog,
    closeProductDialog,
  };
}

/**
 * Returns loading state for a specific key.
 */
export function usePlannerLoading(key: string) {
  const { state, dispatch } = usePlannerStore();
  const setLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_LOADING', key, loading }),
    [dispatch, key]
  );
  return { isLoading: state.loading[key] ?? false, setLoading };
}

/**
 * Returns interaction state (drag/edit).
 */
export function usePlannerInteraction() {
  const { state, dispatch } = usePlannerStore();

  const startDrag = useCallback(
    (eventId: string) => dispatch({ type: 'START_DRAG', eventId }),
    [dispatch]
  );
  const endDrag = useCallback(() => dispatch({ type: 'END_DRAG' }), [dispatch]);
  const startEdit = useCallback(
    (eventId: string) => dispatch({ type: 'START_EDIT', eventId }),
    [dispatch]
  );
  const endEdit = useCallback(() => dispatch({ type: 'END_EDIT' }), [dispatch]);

  return {
    ...state.interaction,
    startDrag,
    endDrag,
    startEdit,
    endEdit,
  };
}

/**
 * Returns resource filter state.
 */
export function usePlannerResourceFilter() {
  const { state, dispatch } = usePlannerStore();
  const setFilter = useCallback(
    (resourceIds: string[] | null) => dispatch({ type: 'SET_RESOURCE_FILTER', resourceIds }),
    [dispatch]
  );
  return { activeResourceFilter: state.activeResourceFilter, setFilter };
}

/**
 * Sync helper: allows legacy code to push state into the store
 * without fully migrating. Call this in useEffect to keep the
 * store in sync with legacy useState values.
 * 
 * Example:
 *   const syncToStore = usePlannerSync();
 *   useEffect(() => {
 *     syncToStore({ selectedDate: legacyCurrentDate, viewMode: legacyViewMode });
 *   }, [legacyCurrentDate, legacyViewMode]);
 */
export function usePlannerSync() {
  const { dispatch } = usePlannerStore();
  return useCallback(
    (partial: Partial<Pick<PlannerState, 'selectedDate' | 'viewMode' | 'lastPath'>>) =>
      dispatch({ type: 'SYNC_FROM_LEGACY', partial }),
    [dispatch]
  );
}
