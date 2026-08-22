/**
 * SCANNER HARDENING – STEG 9: enda ingången för V2-scanningar.
 *
 * Användarens scan blir EN operation med ett operation_id som skapas här,
 * en gång, och sedan återanvänds vid varje retry. Kön är durable (IndexedDB).
 */

import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';
import { commandForOperation, type ScannerOperationKind } from '@/lib/scanner/commandTypes';
import type { QueuedOperation } from '@/lib/scanner/operationQueueTypes';
import { queueLaneKey } from '@/lib/scanner/operationQueueTypes';
import { queueScanSource, toScanEventMeta, type ScanEventMeta } from '@/lib/scanner/scanEventFidelity';
import type { ScanEvent } from '@/services/scanner/types';
import { OperationQueueStore } from '@/lib/scanner/operationQueueStore';
import { drainQueue, processOperation, type SendOperation } from '@/lib/scanner/operationQueueRunner';
import { submitScannerOperation, newOperationId } from '@/services/scannerOperationV2Service';

export interface EnqueueScanOperationInput {
  operation: ScannerOperationKind;
  packingId: string;
  packingSessionId?: string | null;
  organizationId?: string | null;
  itemId?: string | null;
  sku?: string | null;
  bookingNumber?: string | null;
  reservationId?: string | null;
  reservationLineId?: string | null;
  parcelId?: string | null;
  quantityDelta?: number | null;
  performedBy?: string | null;
  deviceId?: string | null;
  scanSource?: QueuedOperation['scan_source'];
  scanValue?: string | null;
  /** STEG 11: hela scan-eventet, inte bara värdet. */
  scanEvent?: ScanEvent | null;
  scanEventMeta?: ScanEventMeta | null;
  /** Assigned synchronously at physical scan receipt to preserve rapid-scan order. */
  queueSequence?: number;
}

let lastQueueSequenceMs = 0;
let queueSequenceWithinMs = 0;
export const nextOperationQueueSequence = (atMs: number = Date.now()): number => {
  const ms = Math.max(0, Math.floor(atMs));
  if (ms === lastQueueSequenceMs) queueSequenceWithinMs = Math.min(queueSequenceWithinMs + 1, 999);
  else { lastQueueSequenceMs = ms; queueSequenceWithinMs = 0; }
  return ms * 1000 + queueSequenceWithinMs;
};

export const buildQueuedOperation = (
  input: EnqueueScanOperationInput,
  operationId: string = newOperationId(),
  createdAt: string = new Date().toISOString(),
): QueuedOperation => ({
  operation_id: operationId,
  organization_id: input.organizationId ?? null,
  command: commandForOperation(input.operation),
  intended_action: input.operation,
  packing_id: input.packingId,
  packing_session_id: input.packingSessionId ?? null,
  item_id: input.itemId ?? null,
  sku: input.sku ?? null,
  booking_number: input.bookingNumber ?? null,
  reservation_id: input.reservationId ?? null,
  reservation_line_id: input.reservationLineId ?? null,
  parcel_id: input.parcelId ?? null,
  quantity_delta: input.quantityDelta ?? null,
  performed_by: input.performedBy ?? null,
  device_id: input.deviceId ?? null,
  scan_source:
    input.scanSource ?? (input.scanEvent ? queueScanSource(input.scanEvent.source) : 'unknown'),
  scan_value: input.scanValue ?? input.scanEvent?.value ?? null,
  scan_event:
    input.scanEventMeta ?? (input.scanEvent ? toScanEventMeta(input.scanEvent) : null),
  created_at: createdAt,
  queue_sequence: input.queueSequence ?? nextOperationQueueSequence(),
  attempt_count: 0,
  last_attempt_at: null,
  state: 'PENDING',
  last_error: null,
  result: null,
});

let store: OperationQueueStore | null = null;
export const getOperationQueue = (): OperationQueueStore => (store ??= new OperationQueueStore());
export const __setOperationQueueForTests = (s: OperationQueueStore | null) => {
  store = s;
};

export const sendQueuedOperation: SendOperation = (op) =>
  submitScannerOperation({
    operation: op.intended_action as ScannerOperationKind,
    operationId: op.operation_id, // SAMMA id vid retry
    packingId: op.packing_id,
    organizationId: op.organization_id,
    reservationId: op.reservation_id,
    reservationLineId: op.reservation_line_id,
    itemId: op.item_id,
    serialNumber: (op.command === 'PACK_INSTANCE' || op.command === 'UNPACK_INSTANCE' || op.command === 'RETURN_INSTANCE') ? op.scan_value : null,
    sku: op.sku,
    quantityDelta: op.quantity_delta,
    bookingNumber: op.booking_number,
    parcelId: op.parcel_id,
    sessionId: op.packing_session_id,
    performedBy: op.performed_by,
    deviceId: op.device_id,
    scanSource: op.scan_source,
    scanEvent: op.scan_event,
  });

export const enqueueScanOperation = async (input: EnqueueScanOperationInput): Promise<QueuedOperation> =>
  getOperationQueue().enqueue(buildQueuedOperation(input));

/** Anropas vid app-start, reload, online-event och efter varje scan. */
export const resumeAndDrain = async (send: SendOperation = sendQueuedOperation): Promise<number> =>
  drainQueue(getOperationQueue(), send);

/** Process an operation that was already durably persisted at scan receipt. */
export const processPersistedScanOperation = async (
  operationId: string,
  send: SendOperation = sendQueuedOperation,
): Promise<QueuedOperation | null> => {
  const queue = getOperationQueue();
  const existing = await queue.get(operationId);
  if (!existing) return null;

  // Never overtake an unresolved earlier physical/user operation in the same
  // packing lane. This is essential for PACK -> UNPACK correctness when the
  // PACK response is UNKNOWN: the UNPACK must wait until PACK is terminal.
  const lane = queueLaneKey(existing);
  const earlierUnresolved = (await queue.resumable()).some((candidate) =>
    candidate.operation_id !== existing.operation_id &&
    queueLaneKey(candidate) === lane &&
    candidate.queue_sequence < existing.queue_sequence
  );
  if (earlierUnresolved) return existing;

  return processOperation(queue, existing, send);
};

/** Enqueue + process exactly this operation once. Terminal results are returned
 * even though the durable row is finalized/removed afterwards. */
export const enqueueAndProcessScanOperation = async (
  input: EnqueueScanOperationInput,
  send: SendOperation = sendQueuedOperation,
): Promise<QueuedOperation> => {
  const queued = await enqueueScanOperation(input);
  const processed = await processPersistedScanOperation(queued.operation_id, send);
  return processed ?? queued;
};

/**
 * Dubbelspärr: när V2 är ON äger operation queue scanningen och legacy
 * ScanQueue får inte ta emot samma scan (annars kan den processas två gånger).
 */
export const shouldUseLegacyScanQueue = (): boolean => !SCANNER_TRANSACTION_V2;
