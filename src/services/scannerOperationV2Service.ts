/**
 * SCANNER HARDENING – STEG 8: WMS-first klient.
 *
 * Enda vägen för V2-scanningar. Inga lokala mutationer, ingen aritmetik,
 * inget optimistiskt antagande om att WMS lyckades. Anropar Planning-gatewayen
 * `scanner-operation-v2` som i sin tur talar med WMS command gateway och
 * returnerar det auktoritativa resultatet.
 *
 * Legacy-vägarna (scannerService.ts) lever kvar orörda bakom
 * SCANNER_TRANSACTION_V2 = OFF fram till slutlig cutover.
 */

import { getToken } from '@/services/mobileApiService';
import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';
import {
  commandForOperation,
  type ScannerCommand,
  type ScannerCommandResult,
  type ScannerOperationKind,
} from '@/lib/scanner/commandTypes';

const ENDPOINT =
  'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/scanner-operation-v2';

export const newOperationId = (): string =>
  (globalThis.crypto?.randomUUID?.() ??
    `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export interface ScannerOperationInput {
  operation: ScannerOperationKind;
  packingId: string;
  itemId?: string | null;
  serialNumber?: string | null;
  sku?: string | null;
  /** Delta (1 / -1 / n). Aldrig en beräknad ny total. */
  quantityDelta?: number | null;
  bookingNumber?: string | null;
  parcelId?: string | null;
  sessionId?: string | null;
  performedBy?: string | null;
  /** Sätt vid retry för att behålla idempotens. */
  operationId?: string;
}

export const buildScannerCommand = (input: ScannerOperationInput): ScannerCommand => ({
  operationId: input.operationId || newOperationId(),
  type: commandForOperation(input.operation),
  packingId: input.packingId,
  itemId: input.itemId ?? null,
  serialNumber: input.serialNumber ?? null,
  sku: input.sku ?? null,
  quantityDelta: input.quantityDelta ?? null,
  bookingNumber: input.bookingNumber ?? null,
  parcelId: input.parcelId ?? null,
  sessionId: input.sessionId ?? null,
  performedBy: input.performedBy ?? null,
});

export const isScannerV2Active = (): boolean => Boolean(SCANNER_TRANSACTION_V2);

export const submitScannerOperation = async (
  input: ScannerOperationInput,
): Promise<ScannerCommandResult> => {
  const command = buildScannerCommand(input);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), command }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: (body?.status as ScannerCommandResult['status']) || 'rejected',
        operationId: command.operationId,
        itemId: command.itemId,
        message: body?.error || `Gateway ${response.status}`,
        debugCode: body?.debugCode || `GATEWAY_${response.status}`,
      };
    }
    return {
      ...(body as ScannerCommandResult),
      operationId: body?.operationId || command.operationId,
    };
  } catch (err: any) {
    return {
      status: 'rejected',
      operationId: command.operationId,
      itemId: command.itemId,
      message: err?.message || 'Nätverksfel',
      debugCode: 'NETWORK_ERROR',
    };
  }
};
