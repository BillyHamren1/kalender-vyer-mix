/**
 * SCANNER HARDENING – STEG 9: enda ingången för V2-scanningar.
 *
 * Användarens scan blir EN operation med ett operation_id som skapas här,
 * en gång, och sedan återanvänds vid varje retry. Kön är durable (IndexedDB).
 */

import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';
import { commandForOperation, type ScannerOperationKind } from '@/lib/scanner/commandTypes';
import type { QueuedOperation } from '@/lib/scanner/operationQueueTypes';
import { OperationQueueStore } from '@/lib/scanner/operationQueueStore';
import { drainQueue, type SendOperation } from '@/lib/scanner/operationQueueRunner';
import { submitScannerOperation, newOperationId } from '@/services/scannerOperationV2Service';

export interface EnqueueScanOperationInput {
  operation: ScannerOperationKind;
  packingId: string;
  packingSessionId?: string | null;
  organizationId?: string | null;
  itemId?: string | null;
  bookingNumber?: string | null;
  reservationId?: string | null;
  quantityDelta?: number | null;
  performedBy?: string | null;
  deviceId?: string | null;
  scanSource?: QueuedOperation['scan_source'];
  scanValue?: string | null;
}

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
  booking_number: input.bookingNumber ?? null,
  reservation_id: input.reservationId ?? null,
  quantity_delta: input.quantityDelta ?? null,
  performed_by: input.performedBy ?? null,
  device_id: input.deviceId ?? null,
  scan_source: input.scanSource ?? 'unknown',
  scan_value: input.scanValue ?? null,
  created_at: createdAt,
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
    itemId: op.item_id,
    serialNumber: op.scan_value,
    quantityDelta: op.quantity_delta,
    bookingNumber: op.booking_number,
    sessionId: op.packing_session_id,
    performedBy: op.performed_by,
  });

export const enqueueScanOperation = async (input: EnqueueScanOperationInput): Promise<QueuedOperation> =>
  getOperationQueue().enqueue(buildQueuedOperation(input));

/** Anropas vid app-start, reload, online-event och efter varje scan. */
export const resumeAndDrain = async (send: SendOperation = sendQueuedOperation): Promise<number> =>
  drainQueue(getOperationQueue(), send);

/**
 * Dubbelspärr: när V2 är ON äger operation queue scanningen och legacy
 * ScanQueue får inte ta emot samma scan (annars kan den processas två gånger).
 */
export const shouldUseLegacyScanQueue = (): boolean => !SCANNER_TRANSACTION_V2;
