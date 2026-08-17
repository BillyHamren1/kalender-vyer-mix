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
import { nextOperationQueueSequence } from '@/services/scanner/operationQueueService';
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
  /** Read-only 15A control/state endpoint in WMS. Never used for scanner commands. */
  wmsControlUrl: string;
  authToken?: string;
  packingSessionId?: string | null;
}

export interface SimulatedScan {
  operation: ScannerOperationKind;
  packingId: string;
  itemId?: string | null;
  serialNumber?: string | null;
  sku?: string | null;
  bookingNumber?: string | null;
  reservationId?: string | null;
  parcelId?: string | null;
  sessionId?: string | null;
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
  readonly results = new Map<string, ScannerCommandResult>();

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
      organizationId: this.config.organizationId,
      reservationId: input.reservationId ?? null,
      serialNumber: input.serialNumber ?? null,
      sku: input.sku ?? null,
      quantityDelta: input.quantityDelta ?? null,
      bookingNumber: input.bookingNumber ?? null,
      parcelId: input.parcelId ?? null,
      sessionId: input.sessionId ?? this.config.packingSessionId ?? null,
      performedBy: `e2e:${this.config.runId}`,
      deviceId: input.deviceId,
      scanSource: input.scanEvent.source,
      scanEvent: input.scanEvent,
      operationId: input.operationId ?? newOperationId(),
    });

    const op: QueuedOperation = {
      operation_id: command.operationId,
      organization_id: this.config.organizationId,
      command: command.type,
      intended_action: input.operation,
      packing_id: input.packingId,
      packing_session_id: input.sessionId ?? this.config.packingSessionId ?? null,
      item_id: input.itemId ?? null,
      sku: input.sku ?? null,
      booking_number: input.bookingNumber ?? null,
      reservation_id: input.reservationId ?? null,
      parcel_id: input.parcelId ?? null,
      quantity_delta: input.quantityDelta ?? null,
      performed_by: `e2e:${this.config.runId}`,
      device_id: input.deviceId,
      scan_source: input.scanEvent.type === 'rfid' ? 'rfid' : input.scanEvent.input_channel === 'keyboard' ? 'manual' : input.scanEvent.source === 'camera' ? 'camera' : 'hardware',
      scan_value: input.scanEvent.value,
      scan_event: input.scanEvent,
      created_at: new Date().toISOString(),
      queue_sequence: nextOperationQueueSequence(input.scanEvent.scanned_at_ms ?? Date.now()),
      attempt_count: 0,
      last_attempt_at: null,
      state: 'PENDING',
      last_error: null,
      result: null,
    };

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
          organizationId: op.organization_id,
          reservationId: op.reservation_id,
          itemId: op.item_id,
          serialNumber: op.command === 'PACK_INSTANCE' || op.command === 'UNPACK_INSTANCE' || op.command === 'RETURN_INSTANCE' ? op.scan_value : null,
          sku: op.sku,
          quantityDelta: op.quantity_delta,
          bookingNumber: op.booking_number,
          parcelId: op.parcel_id,
          sessionId: op.packing_session_id,
          performedBy: op.performed_by,
          deviceId: op.device_id,
          scanSource: op.scan_source,
          scanEvent: op.scan_event,
        },
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
      onResult: (op, result) => {
        this.results.set(op.operation_id, result);
        this.projection = applyAuthoritativeResult(this.projection, result);
      },
    });
  }

  /** Läser WMS canonical state (read-only) för verifiering. */
  async readWmsState(packingId: string, itemId: string): Promise<unknown> {
    const url = `${this.config.wmsControlUrl}?action=state&packingId=${encodeURIComponent(packingId)}&itemId=${encodeURIComponent(itemId)}&runId=${encodeURIComponent(this.config.runId)}`;
    const res = await fetch(url, {
      headers: this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {},
    });
    return res.json().catch(() => null);
  }

  async readOperationState(operationId: string): Promise<unknown> {
    const url = `${this.config.wmsControlUrl}?action=operation&operationId=${encodeURIComponent(operationId)}&runId=${encodeURIComponent(this.config.runId)}`;
    const res = await fetch(url, { headers: this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {} });
    return res.json().catch(() => null);
  }

  async readReconciliation(): Promise<unknown> {
    const url = `${this.config.wmsControlUrl}?action=reconcile&runId=${encodeURIComponent(this.config.runId)}`;
    const res = await fetch(url, { headers: this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : {} });
    return res.json().catch(() => null);
  }

  resultFor(operationId: string): ScannerCommandResult | null {
    return this.results.get(operationId) ?? null;
  }

  mutationsFor(operationId: string): number {
    return this.wire.filter((w) => w.operationId === operationId).length;
  }
}
