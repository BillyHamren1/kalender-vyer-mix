/**
 * SCANNER HARDENING – STEG 15B: E2E test driver.
 *
 * Driver-lagret simulerar ENDAST fysisk hårdvara. Kö, kommandobyggare,
 * projektion och gateway-anrop är den riktiga produktionskoden.
 * Ingen genväg till lokal quantity-update finns här.
 */

import { OperationQueueStore, createMemoryAdapter } from '@/lib/scanner/operationQueueStore';
import type { OperationQueueAdapter } from '@/lib/scanner/operationQueueStore';
import type { QueuedOperation } from '@/lib/scanner/operationQueueTypes';
import { drainQueue, OperationTimeoutError } from '@/lib/scanner/operationQueueRunner';
import { buildScannerCommand, newOperationId } from '@/services/scannerOperationV2Service';
import type { ScannerCommandResult } from '@/lib/scanner/commandTypes';
import type { ScannerOperationKind } from '@/lib/scanner/commandTypes';
import type { ScanEventMeta } from '@/lib/scanner/scanEventFidelity';
import {
  applyAuthoritativeResult,
  emptyProjectionState,
  type ScannerProjectionState,
} from '@/lib/scanner/authoritativeProjection';

export type NetworkMode = 'up' | 'down' | 'response_lost';

export interface HarnessConfig {
  runId: string;
  organizationId: string;
  gatewayUrl: string;
  authToken?: string;
}

export interface SimulatedScan {
  operation: ScannerOperationKind;
  packingId: string;
  itemId?: string | null;
  serialNumber?: string | null;
  bookingNumber?: string | null;
  quantityDelta?: number | null;
  deviceId: string;
  scanEvent: ScanEventMeta;
  /** Sätts endast vid retry av samma fysiska operation. */
  operationId?: string;
}

export const makeScanEvent = (over: Partial<ScanEventMeta> & { value: string }): ScanEventMeta => ({
  scan_id: `scan-${Math.random().toString(16).slice(2)}`,
  type: 'barcode',
  source: 'zebra_datawedge',
  input_channel: 'hardware',
  symbology: 'CODE128',
  device_info: 'e2e-device',
  scanned_at: new Date().toISOString(),
  scanned_at_ms: Date.now(),
  rssi: null,
  antenna_id: null,
  raw_data: null,
  is_duplicate: false,
  job_context: null,
  packing_context: null,
  parcel_context: null,
  ...over,
} as ScanEventMeta);

export class E2EHarness {
  readonly store: OperationQueueStore;
  network: NetworkMode = 'up';
  projection: ScannerProjectionState = emptyProjectionState();
  /** Varje faktiskt utgående HTTP-anrop, för duplicate-mutation-analys. */
  readonly wire: Array<{ operationId: string; command: string; attempt: number }> = [];

  constructor(
    private config: HarnessConfig,
    private adapter: OperationQueueAdapter = createMemoryAdapter(),
  ) {
    this.store = new OperationQueueStore(adapter);
  }

  /** Simulerar app-reload/crash: ny store, SAMMA persistenta adapter. */
  reload(): E2EHarness {
    const next = new E2EHarness(this.config, this.adapter);
    next.network = this.network;
    next.projection = this.projection;
    return next;
  }

  /** Ett fysiskt scan-event → exakt en köad operation. */
  async scan(input: SimulatedScan): Promise<QueuedOperation> {
    const command = buildScannerCommand({
      operation: input.operation,
      packingId: input.packingId,
      itemId: input.itemId ?? null,
      serialNumber: input.serialNumber ?? null,
      quantityDelta: input.quantityDelta ?? null,
      bookingNumber: input.bookingNumber ?? null,
      scanEvent: input.scanEvent,
      operationId: input.operationId ?? newOperationId(),
    });

    const op: QueuedOperation = {
      operation_id: command.operationId,
      organization_id: this.config.organizationId,
      command: command.type,
      intended_action: input.operation,
      packing_id: input.packingId,
      packing_session_id: null,
      item_id: input.itemId ?? null,
      booking_number: input.bookingNumber ?? null,
      reservation_id: null,
      quantity_delta: input.quantityDelta ?? null,
      performed_by: `e2e:${this.config.runId}`,
      device_id: input.deviceId,
      scan_source: input.scanEvent.input_channel === 'keyboard' ? 'manual' : 'hardware',
      scan_value: input.scanEvent.value,
      scan_event: input.scanEvent,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      last_attempt_at: null,
      state: 'PENDING',
      last_error: null,
    } as QueuedOperation;

    return this.store.enqueue(op);
  }

  /** Skickar mot den riktiga test-gatewayen, med injicerade fel. */
  private send = async (op: QueuedOperation): Promise<ScannerCommandResult> => {
    if (this.network === 'down') {
      throw new OperationTimeoutError('network down (injected)');
    }
    this.wire.push({
      operationId: op.operation_id,
      command: op.command,
      attempt: op.attempt_count,
    });

    const response = await fetch(this.config.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scanner-e2e-run-id': this.config.runId,
        ...(this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {}),
      },
      body: JSON.stringify({
        command: {
          operationId: op.operation_id,
          type: op.command,
          packingId: op.packing_id,
          itemId: op.item_id,
          serialNumber: op.scan_event?.value ?? null,
          quantityDelta: op.quantity_delta,
          bookingNumber: op.booking_number,
          performedBy: op.performed_by,
          scanEvent: op.scan_event,
        },
        organizationId: op.organization_id,
        runId: this.config.runId,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as ScannerCommandResult;

    if (this.network === 'response_lost') {
      // Servern har committat, men svaret når aldrig klienten.
      throw new OperationTimeoutError('response lost after commit (injected)');
    }
    return body;
  };

  async drain(): Promise<void> {
    await drainQueue(this.store, this.send, {
      onResult: (_op, result) => {
        this.projection = applyAuthoritativeResult(this.projection, result);
      },
    });
  }

  /** Läser WMS canonical state (read-only) för verifiering. */
  async readWmsState(packingId: string, itemId: string): Promise<unknown> {
    const url = `${this.config.gatewayUrl}?action=state&packingId=${encodeURIComponent(packingId)}&itemId=${encodeURIComponent(itemId)}&runId=${encodeURIComponent(this.config.runId)}`;
    const res = await fetch(url, {
      headers: this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {},
    });
    return res.json().catch(() => null);
  }

  mutationsFor(operationId: string): number {
    return this.wire.filter((w) => w.operationId === operationId).length;
  }
}
