/**
 * SCANNER HARDENING – STEG 8: WMS-first command contract.
 *
 * V2 känner INTE till lokal aritmetik. En scanning översätts till ett
 * kommando som skickas till WMS command gateway (`scanner-operation-v2`).
 * WMS svarar auktoritativt med packed/required quantity och Planning
 * projicerar svaret rakt av.
 */

export const SCANNER_COMMAND_TYPES = [
  'PACK_QUANTITY',
  'UNPACK_QUANTITY',
  'PACK_INSTANCE',
  'UNPACK_INSTANCE',
  'RESET_ITEM',
  'VERIFY_PRODUCT',
  'RETURN_INSTANCE',
  'RETURN_QUANTITY',
] as const;

export type ScannerCommandType = (typeof SCANNER_COMMAND_TYPES)[number];

/** Logiska scanner-operationer i Planning-UI:t. */
export type ScannerOperationKind =
  | 'increment'
  | 'decrement'
  | 'decrement_item'
  | 'decrement_by_serial'
  | 'toggle'
  | 'reset'
  | 'verify_product'
  | 'physical_return_scan'
  | 'return_quantity';

/**
 * Enda tillåtna mappningen operation → WMS-kommando i V2.
 *
 * Notera:
 * - `decrement_by_serial` får ALDRIG gå via fysisk checkin/return längre.
 *   Den är en packnings-ångring → UNPACK_INSTANCE.
 * - `physical_return_scan` är den enda fysiska returvägen → RETURN_INSTANCE.
 */
export const OPERATION_TO_COMMAND: Record<ScannerOperationKind, ScannerCommandType> = {
  increment: 'PACK_QUANTITY',
  decrement: 'UNPACK_QUANTITY',
  decrement_item: 'UNPACK_QUANTITY',
  decrement_by_serial: 'UNPACK_INSTANCE',
  toggle: 'PACK_QUANTITY',
  reset: 'RESET_ITEM',
  verify_product: 'VERIFY_PRODUCT',
  physical_return_scan: 'RETURN_INSTANCE',
  return_quantity: 'RETURN_QUANTITY',
};

export const commandForOperation = (op: ScannerOperationKind): ScannerCommandType =>
  OPERATION_TO_COMMAND[op];

export interface ScannerCommand {
  /** Idempotensnyckel — retry med samma id får aldrig dubbelräkna. */
  operationId: string;
  type: ScannerCommandType;
  packingId: string;
  itemId?: string | null;
  serialNumber?: string | null;
  sku?: string | null;
  /** Endast för *_QUANTITY-kommandon. Alltid ett DELTA, aldrig en ny total. */
  quantityDelta?: number | null;
  bookingNumber?: string | null;
  parcelId?: string | null;
  sessionId?: string | null;
  performedBy?: string | null;
  /** STEG 11: komplett scan-metadata följer med kommandot till WMS. */
  scanEvent?: import('./scanEventFidelity').ScanEventMeta | null;
}

export type ScannerCommandStatus =
  | 'accepted'
  | 'rejected'
  | 'wrong_booking'
  | 'over_capacity'
  | 'not_found'
  | 'duplicate';

/** Auktoritativt svar från WMS. Planning räknar aldrig själv. */
export interface ScannerCommandResult {
  status: ScannerCommandStatus;
  operationId: string;
  itemId?: string | null;
  productName?: string | null;
  /** WMS sanning — total antal packade, inte ett delta. */
  packedQuantity?: number | null;
  requiredQuantity?: number | null;
  returnedQuantity?: number | null;
  message?: string | null;
  debugCode?: string | null;
  /** true när WMS kände igen operationId sedan tidigare (retry). */
  replayed?: boolean;
}

export const isAcceptedResult = (r: ScannerCommandResult): boolean =>
  r.status === 'accepted' || r.status === 'duplicate';
