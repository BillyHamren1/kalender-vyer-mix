/**
 * ============================================================
 * useEventEditController — Edit Flow Orchestrator
 * ============================================================
 * 
 * Central controller that ensures only ONE edit operation is
 * active at a time across all planner edit dialogs/popovers.
 * 
 * This hook provides:
 *   1. MUTEX: Only one edit mode active at a time
 *   2. TRACKING: Which event is being edited and how
 *   3. CONFLICT PREVENTION: Prevents opening a second dialog
 *      while another is active
 *   4. CLEAN CANCEL: Ensures state is fully reset on cancel
 * 
 * MIGRATION: This controller coexists with existing dialog
 * state. Components can gradually adopt it by calling
 * `requestEdit()` before opening their dialog and `endEdit()`
 * when closing. Components that don't use it yet continue
 * to work as before.
 * ============================================================
 */

import { useState, useCallback, useRef } from 'react';
import type { EditableEvent } from '@/services/eventEditHelpers';

// ─── Types ─────────────────────────────────────────────────

/** Discriminated edit mode — identifies which edit flow is active */
export type EditMode =
  | 'quickTime'      // QuickTimeEditPopover
  | 'editTime'       // EditEventTimeDialog
  | 'moveDate'       // MoveEventDateDialog
  | 'addRigDay'      // AddRiggDayDialog
  | 'duplicate'      // Duplicate event flow
  | 'delete'         // Delete confirmation
  | 'custom';        // Future/extensible

export interface EditState {
  /** Whether any edit is currently active */
  isEditing: boolean;
  /** Which edit mode is active (null if none) */
  activeMode: EditMode | null;
  /** The event being edited (null if none) */
  editingEvent: EditableEvent | null;
  /** Unique edit session ID (for dedup/tracking) */
  sessionId: string | null;
}

export interface EditRequest {
  mode: EditMode;
  event: EditableEvent;
}

export interface EventEditController {
  /** Current edit state */
  state: EditState;
  
  /**
   * Request to start an edit. Returns true if granted, false if
   * another edit is already active. If force=true, the current
   * edit is cancelled and the new one takes over.
   */
  requestEdit: (request: EditRequest, force?: boolean) => boolean;
  
  /**
   * End the current edit (save or cancel).
   * Resets all edit state.
   */
  endEdit: () => void;
  
  /**
   * Check if a specific edit mode can be started right now.
   * Returns false if another mode is active.
   */
  canEdit: (mode: EditMode) => boolean;
  
  /**
   * Check if a specific event is currently being edited.
   */
  isEventBeingEdited: (eventId: string) => boolean;
  
  /**
   * Check if the current active mode matches.
   */
  isActiveMode: (mode: EditMode) => boolean;
}

// ─── Hook ──────────────────────────────────────────────────

const initialState: EditState = {
  isEditing: false,
  activeMode: null,
  editingEvent: null,
  sessionId: null,
};

let sessionCounter = 0;
function generateSessionId(): string {
  return `edit-${++sessionCounter}-${Date.now()}`;
}

export function useEventEditController(): EventEditController {
  const [state, setState] = useState<EditState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const requestEdit = useCallback((request: EditRequest, force = false): boolean => {
    const current = stateRef.current;

    // If already editing and not forcing, deny the request
    if (current.isEditing && !force) {
      console.warn(
        `[EventEditController] Edit request denied: "${request.mode}" blocked by active "${current.activeMode}" on event ${current.editingEvent?.id}`
      );
      return false;
    }

    // Grant the edit
    const newState: EditState = {
      isEditing: true,
      activeMode: request.mode,
      editingEvent: request.event,
      sessionId: generateSessionId(),
    };

    setState(newState);
    return true;
  }, []);

  const endEdit = useCallback(() => {
    setState(initialState);
  }, []);

  const canEdit = useCallback((mode: EditMode): boolean => {
    const current = stateRef.current;
    // Can edit if nothing is active, or if the same mode is re-requested (idempotent)
    return !current.isEditing || current.activeMode === mode;
  }, []);

  const isEventBeingEdited = useCallback((eventId: string): boolean => {
    return stateRef.current.isEditing && stateRef.current.editingEvent?.id === eventId;
  }, []);

  const isActiveMode = useCallback((mode: EditMode): boolean => {
    return stateRef.current.activeMode === mode;
  }, []);

  return {
    state,
    requestEdit,
    endEdit,
    canEdit,
    isEventBeingEdited,
    isActiveMode,
  };
}

/**
 * Convenience: creates a controller and wraps dialog open/close
 * handlers to automatically manage edit state.
 * 
 * Usage:
 *   const ctrl = useEventEditController();
 *   const quickTimeHandlers = createDialogHandlers(ctrl, 'quickTime');
 *   
 *   // In JSX:
 *   <QuickTimeEditPopover
 *     onOpenChange={(open) => {
 *       if (open) quickTimeHandlers.onOpen(event);
 *       else quickTimeHandlers.onClose();
 *     }}
 *   />
 */
export function createDialogHandlers(
  controller: EventEditController,
  mode: EditMode
) {
  return {
    /**
     * Call when dialog/popover opens. Returns false if blocked.
     */
    onOpen: (event: EditableEvent, force = false): boolean => {
      return controller.requestEdit({ mode, event }, force);
    },

    /**
     * Call when dialog/popover closes (save or cancel).
     */
    onClose: () => {
      // Only end edit if this mode is the active one
      if (controller.isActiveMode(mode)) {
        controller.endEdit();
      }
    },

    /**
     * Check if this dialog can be opened right now.
     */
    canOpen: (): boolean => {
      return controller.canEdit(mode);
    },
  };
}
