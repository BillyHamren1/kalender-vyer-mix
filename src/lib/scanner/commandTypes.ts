/**
 * Scanner V2 command contract. WMS owns all canonical mutation state.
 */
export const SCANNER_COMMAND_TYPES = [
  'PACK_QUANTITY',
  'UNPACK_QUANTITY',
  'PACK_INSTANCE',
  'UNPACK_INSTANCE',
  'RETURN_INSTANCE',
  'RETURN_QUANTITY',
] as const;

export type ScannerCommandType = (typeof SCANNER_COMMAND_TYPES)[number];

export type ScannerOperationKind =
  | 'pack_quantity'
  | 'unpack_quantity'
  | 'pack_instance'
  | 'unpack_instance'
  | 'increment'
  | 'decrement'
  | 'decrement_item'
  | 'decrement_by_serial'
  | 'toggle'
  | 'physical_return_scan'
  | 'return_quantity';

export const OPERATION_TO_COMMAND: Record<ScannerOperationKind, ScannerCommandType> = {
  pack_quantity: 'PACK_QUANTITY',
  unpack_quantity: 'UNPACK_QUANTITY',
  pack_instance: 'PACK_INSTANCE',
  unpack_instance: 'UNPACK_INSTANCE',
  increment: 'PACK_QUANTITY',
  decrement: 'UNPACK_QUANTITY',
  decrement_item: 'UNPACK_QUANTITY',
  decrement_by_serial: 'UNPACK_INSTANCE',
  toggle: 'PACK_QUANTITY',
  physical_return_scan: 'RETURN_INSTANCE',
  return_quantity: 'RETURN_QUANTITY',
};

export const commandForOperation = (op: ScannerOperationKind): ScannerCommandType =>
  OPERATION_TO_COMMAND[op];

export interface ScannerCommand {
  operationId: string;
  type: ScannerCommandType;
  packingId: string;
  organizationId?: string | null;
  reservationId?: string | null;
  itemId?: string | null;
  serialNumber?: string | null;
  sku?: string | null;
  quantityDelta?: number | null;
  bookingNumber?: string | null;
  parcelId?: string | null;
  sessionId?: string | null;
  performedBy?: string | null;
  deviceId?: string | null;
  scanSource?: string | null;
  scanEvent?: import('./scanEventFidelity').ScanEventMeta | null;
}

export type ScannerCommandStatus =
  | 'accepted'
  | 'rejected'
  | 'wrong_booking'
  | 'over_capacity'
  | 'not_found'
  | 'duplicate'
  | 'unknown';

export interface ScannerCommandResult {
  status: ScannerCommandStatus;
  operationId: string;
  itemId?: string | null;
  productName?: string | null;
  packedQuantity?: number | null;
  requiredQuantity?: number | null;
  returnedQuantity?: number | null;
  message?: string | null;
  debugCode?: string | null;
  replayed?: boolean;
  projectionWarning?: string | null;
}

/** A duplicate is only a successful replay when the server proves it belongs
 * to this same operation_id. A generic "already packed" duplicate is NOT a
 * committed result for the new physical scan. */
export const isAcceptedResult = (r: ScannerCommandResult): boolean =>
  r.status === 'accepted' || (r.status === 'duplicate' && r.replayed === true);

export const isTransientResult = (r: ScannerCommandResult): boolean =>
  r.status === 'unknown';
