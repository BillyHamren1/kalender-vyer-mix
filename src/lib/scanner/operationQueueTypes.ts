/**
 * SCANNER HARDENING – STEG 9: durable operation queue (typer + state machine).
 *
 * Kön lagrar HELA operationen, inte bara scan.value. En operation skapas EN
 * gång med ett operation_id som återanvänds vid varje retry.
 */

import type { ScannerCommandType } from './commandTypes';

export type OperationState =
  | 'PENDING'
  | 'SENDING'
  | 'COMMITTED'
  | 'REJECTED'
  | 'UNKNOWN';

export const TERMINAL_STATES: OperationState[] = ['COMMITTED', 'REJECTED'];
export const RETRYABLE_STATES: OperationState[] = ['PENDING', 'UNKNOWN', 'SENDING'];

export const isTerminalState = (s: OperationState): boolean => TERMINAL_STATES.includes(s);
export const isRetryableState = (s: OperationState): boolean => RETRYABLE_STATES.includes(s);

/** Tillåtna övergångar. Timeout ger UNKNOWN — aldrig REJECTED. */
export const ALLOWED_TRANSITIONS: Record<OperationState, OperationState[]> = {
  PENDING: ['SENDING'],
  SENDING: ['COMMITTED', 'REJECTED', 'UNKNOWN', 'PENDING'],
  UNKNOWN: ['SENDING'],
  COMMITTED: [],
  REJECTED: [],
};

export const canTransition = (from: OperationState, to: OperationState): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to);

export interface QueuedOperation {
  operation_id: string;
  organization_id: string | null;
  /** WMS-kommandot (intended action) — inte bara en rå scan. */
  command: ScannerCommandType;
  intended_action: string;
  packing_id: string;
  packing_session_id: string | null;
  item_id: string | null;
  booking_number: string | null;
  reservation_id: string | null;
  quantity_delta: number | null;
  performed_by: string | null;
  device_id: string | null;
  scan_source: 'camera' | 'hardware' | 'manual' | 'rfid' | 'unknown';
  scan_value: string | null;
  /**
   * STEG 11: komplett scan-metadata. Operationen får aldrig reduceras till
   * enbart scan_value — symbology, device, timestamp och RFID-fält följer med.
   */
  scan_event: import('./scanEventFidelity').ScanEventMeta | null;
  created_at: string;
  attempt_count: number;
  last_attempt_at: string | null;
  state: OperationState;
  last_error: string | null;
  /** Auktoritativt svar från WMS när operationen nått slutstatus. */
  result: unknown | null;
}

/** Ordning spelar roll per packningskontext — detta är serialiseringsnyckeln. */
export const queueLaneKey = (op: Pick<QueuedOperation, 'packing_id' | 'packing_session_id'>): string =>
  `${op.packing_id}::${op.packing_session_id ?? 'no-session'}`;
