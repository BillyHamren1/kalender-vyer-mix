/**
 * Scanner V2 WMS-first client.
 *
 * No local arithmetic and no optimistic mutation. Transport ambiguity is
 * represented as status=unknown so the durable queue can retry the SAME
 * operation_id safely.
 */
import { getToken } from '@/services/mobileApiService';
import { isScannerTransactionV2Enabled } from '@/config/scannerFlags';
import {
  commandForOperation,
  type ScannerCommand,
  type ScannerCommandResult,
  type ScannerOperationKind,
} from '@/lib/scanner/commandTypes';

const configuredEndpoint = (): string => {
  const explicit = (import.meta as any).env?.VITE_SCANNER_OPERATION_V2_URL as string | undefined;
  if (explicit?.trim()) return explicit.trim();
  const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  if (base?.trim()) return `${base.replace(/\/$/, '')}/functions/v1/scanner-operation-v2`;
  throw new Error('SCANNER_V2_ENDPOINT_NOT_CONFIGURED');
};

export const newOperationId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
};

export interface ScannerOperationInput {
  operation: ScannerOperationKind;
  packingId: string;
  organizationId?: string | null;
  reservationId?: string | null;
  reservationLineId?: string | null;
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
  operationId?: string;
  scanEvent?: import('@/lib/scanner/scanEventFidelity').ScanEventMeta | null;
}

export const buildScannerCommand = (input: ScannerOperationInput): ScannerCommand => ({
  operationId: input.operationId || newOperationId(),
  type: commandForOperation(input.operation),
  packingId: input.packingId,
  organizationId: input.organizationId ?? null,
  reservationId: input.reservationId ?? null,
  reservationLineId: input.reservationLineId ?? null,
  itemId: input.itemId ?? null,
  serialNumber: input.serialNumber ?? null,
  sku: input.sku ?? null,
  quantityDelta: input.quantityDelta ?? null,
  bookingNumber: input.bookingNumber ?? null,
  parcelId: input.parcelId ?? null,
  sessionId: input.sessionId ?? null,
  performedBy: input.performedBy ?? null,
  deviceId: input.deviceId ?? null,
  scanSource: input.scanSource ?? null,
  scanEvent: input.scanEvent ?? null,
});

export const isScannerV2Active = (): boolean => isScannerTransactionV2Enabled();

const transientHttpStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

export const submitScannerOperation = async (
  input: ScannerOperationInput,
): Promise<ScannerCommandResult> => {
  const command = buildScannerCommand(input);
  let endpoint: string;
  try {
    endpoint = configuredEndpoint();
  } catch (err: any) {
    return {
      status: 'unknown',
      operationId: command.operationId,
      itemId: command.itemId,
      message: err?.message || 'Scanner V2 endpoint saknas',
      debugCode: 'ENDPOINT_NOT_CONFIGURED',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ command }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (transientHttpStatus(response.status) || body?.status === 'unknown') {
        return {
          status: 'unknown',
          operationId: command.operationId,
          itemId: command.itemId,
          message: body?.error || body?.message || `Gateway ${response.status}`,
          debugCode: body?.debugCode || `GATEWAY_${response.status}`,
        };
      }
      return {
        status: (body?.status as ScannerCommandResult['status']) || 'rejected',
        operationId: command.operationId,
        itemId: command.itemId,
        message: body?.error || body?.message || `Gateway ${response.status}`,
        debugCode: body?.debugCode || `GATEWAY_${response.status}`,
      };
    }

    return {
      ...(body as ScannerCommandResult),
      operationId: body?.operationId || command.operationId,
    };
  } catch (err: any) {
    // A thrown fetch error is ambiguous: the server may have committed before
    // the response disappeared. Never turn this into a terminal rejection.
    return {
      status: 'unknown',
      operationId: command.operationId,
      itemId: command.itemId,
      message: err?.message || 'Nätverksfel',
      debugCode: 'NETWORK_OUTCOME_UNKNOWN',
    };
  }
};
