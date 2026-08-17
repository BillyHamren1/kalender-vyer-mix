/**
 * Executable 15B scenarios. Nothing is marked PASS unless it was actually run.
 * WMS-dependent cases require deterministic fixture identifiers from 15A via
 * SCANNER_E2E_FIXTURES_JSON. Missing fixture fields yield NOT_EXECUTED.
 */
import { E2EHarness, makeScanEvent } from './driver';
import { SCENARIOS, type ScenarioResult } from './scenarios';
import { deriveScanFeedback } from '@/lib/scanner/scanFeedbackState';
import { applyAuthoritativeResult, emptyProjectionState } from '@/lib/scanner/authoritativeProjection';
import { RfidDedupeTracker } from '@/lib/scanner/rfidDedupe';
import { deriveHardwareHealth } from '@/lib/scanner/hardwareHealth';

interface Fixtures {
  packingId?: string;
  packingSessionId?: string;
  bookingNumber?: string;
  quantityItemId?: string;
  serialItemId?: string;
  serialValue?: string;
  wrongBookingNumber?: string;
  returnSerialValue?: string;
  returnItemId?: string;
  wrongReturnSerialValue?: string;
  wrongReturnItemId?: string;
  unknownValue?: string;
  ambiguousSerial?: string;
  orgBValue?: string;
  overpackItemId?: string;
}

const result = (id: string, status: ScenarioResult['status'], reason: string, extra: Partial<ScenarioResult> = {}): ScenarioResult => ({ id, status, reason, ...extra });
const pass = (id: string, reason = 'executed and verified', extra: Partial<ScenarioResult> = {}) => result(id, 'PASS', reason, extra);
const fail = (id: string, reason: string, extra: Partial<ScenarioResult> = {}) => result(id, 'FAIL', reason, extra);
const skip = (id: string, reason: string) => result(id, 'NOT_EXECUTED', reason);

const parseFixtures = (raw?: string): Fixtures | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as Fixtures; } catch { return null; }
};

const packedOf = (state: any): number | null => {
  const candidates = [state?.packed_quantity, state?.packedQuantity, state?.quantity_packed, state?.item?.packed_quantity, state?.state?.packed_quantity];
  const n = candidates.find((v) => typeof v === 'number');
  return typeof n === 'number' ? n : null;
};

const requiredOf = (state: any): number | null => {
  const candidates = [state?.required_quantity, state?.requiredQuantity, state?.quantity_to_pack, state?.item?.required_quantity, state?.state?.required_quantity];
  const n = candidates.find((v) => typeof v === 'number');
  return typeof n === 'number' ? n : null;
};

const allocationCountOf = (state: any): number | null => {
  const candidates = [state?.active_allocation_count, state?.activeAllocationCount, state?.allocation_count, state?.allocationCount, state?.state?.active_allocation_count];
  const n = candidates.find((v) => typeof v === 'number');
  return typeof n === 'number' ? n : null;
};

const returnedOf = (state: any): number | null => {
  const candidates = [state?.returned_quantity, state?.returnedQuantity, state?.quantity_returned, state?.item?.returned_quantity, state?.state?.returned_quantity];
  const n = candidates.find((v) => typeof v === 'number');
  return typeof n === 'number' ? n : null;
};

const isCommittedResult = (r: any): boolean =>
  !!r && (r.status === 'accepted' || (r.status === 'duplicate' && r.replayed === true));

const canonicalMutationCountOf = (state: any): number | null => {
  const candidates = [state?.canonical_mutation_count, state?.canonicalMutationCount, state?.mutation_count, state?.mutationCount];
  const n = candidates.find((v) => typeof v === 'number');
  return typeof n === 'number' ? n : null;
};

const runLocal = async (id: string): Promise<ScenarioResult | null> => {
  if (id === 'ui_state_machine') {
    const pending = deriveScanFeedback({ operationId: 'op', state: 'UNKNOWN', online: true });
    const committed = deriveScanFeedback({ operationId: 'op', state: 'COMMITTED', result: { status: 'accepted', operationId: 'op', packedQuantity: 1 } });
    return pending.playSuccess === false && committed.playSuccess === true ? pass(id) : fail(id, 'feedback state invariant failed');
  }
  if (id === 'datawedge_readiness') {
    const degraded = deriveHardwareHealth({
      online: true, isNative: true, isAndroid: true, isZebraDevice: true,
      dataWedgeListenerActive: true, dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: null, dataWedgeScannerInputOk: null, dataWedgeLastScanTime: null,
      keyboardListenerActive: true, cameraAvailable: false,
      rfidListenerActive: false, rfidNativeAvailable: false, rfidReaderConnected: false,
    });
    const ready = deriveHardwareHealth({
      online: true, isNative: true, isAndroid: true, isZebraDevice: true,
      dataWedgeListenerActive: true, dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: true, dataWedgeScannerInputOk: true, dataWedgeLastScanTime: null,
      keyboardListenerActive: true, cameraAvailable: false,
      rfidListenerActive: false, rfidNativeAvailable: false, rfidReaderConnected: false,
    });
    return !degraded.barcodeScannerReady && ready.barcodeScannerReady ? pass(id) : fail(id, 'listener was treated as ready or verified profile was not ready');
  }
  if (id === 'rfid_dedupe_context') {
    const tracker = new RfidDedupeTracker(5000);
    const first = tracker.evaluate({ epc: 'EPC1', action: 'PACK_INSTANCE', packingId: 'p1' }, 1000);
    const same = tracker.evaluate({ epc: 'EPC1', action: 'PACK_INSTANCE', packingId: 'p1' }, 1100);
    const opposite = tracker.evaluate({ epc: 'EPC1', action: 'UNPACK_INSTANCE', packingId: 'p1' }, 1200);
    return !first.isDuplicate && same.isDuplicate && !opposite.isDuplicate
      ? pass(id)
      : fail(id, 'PACK→UNPACK was incorrectly deduped');
  }
  return null;
};

export async function executeScenarios(env: Record<string, string | undefined>, runId: string): Promise<ScenarioResult[]> {
  const fixtures = parseFixtures(env.SCANNER_E2E_FIXTURES_JSON);
  // Scanner commands must traverse the Planning V2 gateway. The WMS URL is
  // reserved for 15A read-only canonical state/control verification.
  const gatewayUrl = env.SCANNER_E2E_PLANNING_URL!;
  const wmsControlUrl = env.SCANNER_E2E_WMS_URL!;
  const organizationId = env.SCANNER_E2E_FIXTURE_ORG_ID!;
  const authToken = env.SCANNER_E2E_AUTH_TOKEN;
  const out: ScenarioResult[] = [];

  const harness = () => new E2EHarness({ runId, organizationId, gatewayUrl, wmsControlUrl, authToken, packingSessionId: fixtures?.packingSessionId ?? null });

  for (const def of SCENARIOS) {
    const local = await runLocal(def.id);
    if (local) { out.push(local); continue; }

    if (!fixtures?.packingId) { out.push(skip(def.id, '15A fixture config saknas: SCANNER_E2E_FIXTURES_JSON')); continue; }

    try {
      if (def.id === 'operation_id_uniqueness') {
        const h = harness();
        const a = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-E2E' }) });
        const b = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-E2E' }) });
        out.push(a.operation_id !== b.operation_id ? pass(def.id) : fail(def.id, 'two physical scans reused operation_id'));
        continue;
      }

      if (def.id === 'queue_offline_pending' || def.id === 'queue_server_down_no_clone' || def.id === 'failure_before_server_receives') {
        const h = harness(); h.network = 'down';
        const op = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-OFFLINE' }) });
        await h.drain();
        const stored = await h.store.get(op.operation_id);
        out.push(stored && stored.operation_id === op.operation_id && stored.state === 'UNKNOWN' ? pass(def.id, 'operation persisted as UNKNOWN with same id') : fail(def.id, 'operation was lost or terminally rejected'));
        continue;
      }

      if (def.id === 'queue_reload_resume' || def.id === 'reload_during_sending') {
        const h = harness(); h.network = 'down';
        const op = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-RELOAD' }) });
        await h.drain();
        const reloaded = h.reload();
        const stored = await reloaded.store.get(op.operation_id);
        out.push(stored?.operation_id === op.operation_id ? pass(def.id) : fail(def.id, 'reload lost queued operation'));
        continue;
      }

      if (def.id === 'failure_after_commit_response_lost') {
        if (!fixtures.quantityItemId) { out.push(skip(def.id, 'quantityItemId saknas')); continue; }
        const h = harness(); h.network = 'response_lost';
        const op = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-LOST' }) });
        await h.drain();
        if ((await h.store.get(op.operation_id))?.state !== 'UNKNOWN') { out.push(fail(def.id, 'lost response did not become UNKNOWN')); continue; }
        h.network = 'up'; await h.drain();
        const terminal = (await h.store.get(op.operation_id)) === null;
        const opState = await h.readOperationState(op.operation_id);
        const mutations = canonicalMutationCountOf(opState);
        const replay = h.resultFor(op.operation_id);
        if (mutations === null) { out.push(skip(def.id, '15A operation control endpoint exposes no canonical mutation count')); continue; }
        const replayAccepted = isCommittedResult(replay);
        out.push(terminal && mutations === 1 && replayAccepted
          ? pass(def.id, `same operation id resolved; canonical_mutations=${mutations}, replay=${replay?.status}`)
          : fail(def.id, `response-loss invariant failed; terminal=${terminal}, mutations=${mutations}, replay=${replay?.status}`));
        continue;
      }

      if (def.id === 'quantity_e2e') {
        if (!fixtures.quantityItemId) { out.push(skip(def.id, 'quantityItemId saknas')); continue; }
        const h = harness();
        const before = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint returned no packed quantity')); continue; }
        for (let i = 0; i < 10; i++) { await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-Q' }) }); await h.drain(); }
        for (let i = 0; i < 3; i++) { await h.scan({ operation: 'unpack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: -1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-Q' }) }); await h.drain(); }
        const after = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        out.push(after === before + 7 ? pass(def.id, `${before}→${after}`) : fail(def.id, `expected ${before + 7}, got ${after}`));
        continue;
      }

      if (def.id === 'two_devices_quantity') {
        if (!fixtures.quantityItemId) { out.push(skip(def.id, 'quantityItemId saknas')); continue; }
        const a = harness(), b = harness();
        const before = packedOf(await a.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        if (before === null) { out.push(skip(def.id, 'state endpoint unavailable')); continue; }
        await a.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-C' }) });
        await b.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'B', scanEvent: makeScanEvent({ value: 'SKU-C' }) });
        await Promise.all([a.drain(), b.drain()]);
        const after = packedOf(await a.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        out.push(after === before + 2 ? pass(def.id) : fail(def.id, `expected +2, before=${before}, after=${after}`));
        continue;
      }

      if (def.id === 'two_devices_same_instance') {
        if (!fixtures.serialValue || !fixtures.serialItemId) { out.push(skip(def.id, 'serialValue/serialItemId saknas')); continue; }
        const a = harness(), b = harness();
        const before = allocationCountOf(await a.readWmsState(fixtures.packingId, fixtures.serialItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint exposes no active allocation count')); continue; }
        const opA = await a.scan({ operation: 'pack_instance', packingId: fixtures.packingId, serialNumber: fixtures.serialValue, bookingNumber: fixtures.bookingNumber, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.serialValue }) });
        const opB = await b.scan({ operation: 'pack_instance', packingId: fixtures.packingId, serialNumber: fixtures.serialValue, bookingNumber: fixtures.bookingNumber, deviceId: 'B', scanEvent: makeScanEvent({ value: fixtures.serialValue }) });
        await Promise.all([a.drain(), b.drain()]);
        const after = allocationCountOf(await a.readWmsState(fixtures.packingId, fixtures.serialItemId));
        const accepted = [a.resultFor(opA.operation_id), b.resultFor(opB.operation_id)].filter(isCommittedResult).length;
        out.push(after === before + 1 && accepted <= 1 ? pass(def.id, `allocation count ${before}→${after}`) : fail(def.id, `expected exactly one allocation; before=${before}, after=${after}, accepted=${accepted}`));
        continue;
      }

      if (def.id === 'serial_pack_unpack') {
        if (!fixtures.serialValue || !fixtures.serialItemId) { out.push(skip(def.id, 'serialValue/serialItemId saknas')); continue; }
        const h = harness();
        const before = allocationCountOf(await h.readWmsState(fixtures.packingId, fixtures.serialItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint exposes no active allocation count')); continue; }
        await h.scan({ operation: 'pack_instance', packingId: fixtures.packingId, serialNumber: fixtures.serialValue, bookingNumber: fixtures.bookingNumber, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.serialValue }) }); await h.drain();
        const packed = allocationCountOf(await h.readWmsState(fixtures.packingId, fixtures.serialItemId));
        await h.scan({ operation: 'unpack_instance', packingId: fixtures.packingId, serialNumber: fixtures.serialValue, bookingNumber: fixtures.bookingNumber, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.serialValue }) }); await h.drain();
        const after = allocationCountOf(await h.readWmsState(fixtures.packingId, fixtures.serialItemId));
        out.push(packed === before + 1 && after === before ? pass(def.id, `${before}→${packed}→${after}`) : fail(def.id, `non-reversible allocation state ${before}→${packed}→${after}`));
        continue;
      }

      if (def.id === 'serial_unpack_wrong_booking') {
        if (!fixtures.serialValue || !fixtures.serialItemId || !fixtures.wrongBookingNumber) { out.push(skip(def.id, 'serialValue/serialItemId/wrongBookingNumber saknas')); continue; }
        const h = harness();
        const before = allocationCountOf(await h.readWmsState(fixtures.packingId, fixtures.serialItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint exposes no active allocation count')); continue; }
        const op = await h.scan({ operation: 'unpack_instance', packingId: fixtures.packingId, serialNumber: fixtures.serialValue, bookingNumber: fixtures.wrongBookingNumber, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.serialValue }) }); await h.drain();
        const after = allocationCountOf(await h.readWmsState(fixtures.packingId, fixtures.serialItemId));
        const r = h.resultFor(op.operation_id);
        out.push(after === before && r && !isCommittedResult(r) ? pass(def.id) : fail(def.id, `wrong-booking changed state or was accepted; before=${before}, after=${after}, status=${r?.status}`));
        continue;
      }

      if (def.id === 'physical_return') {
        if (!fixtures.returnSerialValue || !fixtures.returnItemId || !fixtures.wrongReturnSerialValue || !fixtures.wrongReturnItemId || !fixtures.wrongBookingNumber) {
          out.push(skip(def.id, 'return + wrongReturn fixtures/wrongBookingNumber saknas'));
          continue;
        }
        const h = harness();
        const before = returnedOf(await h.readWmsState(fixtures.packingId, fixtures.returnItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint exposes no returned quantity')); continue; }
        const op = await h.scan({ operation: 'physical_return_scan', packingId: fixtures.packingId, serialNumber: fixtures.returnSerialValue, bookingNumber: fixtures.bookingNumber, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.returnSerialValue }) }); await h.drain();
        const after = returnedOf(await h.readWmsState(fixtures.packingId, fixtures.returnItemId));
        const r = h.resultFor(op.operation_id);
        const rightBookingOk = isCommittedResult(r) && after !== null && after === before + 1;

        const wrongBefore = returnedOf(await h.readWmsState(fixtures.packingId, fixtures.wrongReturnItemId));
        if (wrongBefore === null) { out.push(skip(def.id, '15A state endpoint exposes no returned quantity for wrong-booking fixture')); continue; }
        const wrongOp = await h.scan({ operation: 'physical_return_scan', packingId: fixtures.packingId, serialNumber: fixtures.wrongReturnSerialValue, bookingNumber: fixtures.wrongBookingNumber, deviceId: 'B', scanEvent: makeScanEvent({ value: fixtures.wrongReturnSerialValue }) }); await h.drain();
        const wrongAfter = returnedOf(await h.readWmsState(fixtures.packingId, fixtures.wrongReturnItemId));
        const wrongResult = h.resultFor(wrongOp.operation_id);
        const wrongBookingBlocked = wrongAfter === wrongBefore && wrongResult && !isCommittedResult(wrongResult);

        out.push(rightBookingOk && wrongBookingBlocked
          ? pass(def.id, `right booking ${before}→${after}; wrong booking unchanged ${wrongBefore}→${wrongAfter}`)
          : fail(def.id, `return invariant failed; right=${before}→${after}/${r?.status}, wrong=${wrongBefore}→${wrongAfter}/${wrongResult?.status}`));
        continue;
      }

      if (def.id === 'overpack_rejected') {
        if (!fixtures.overpackItemId) { out.push(skip(def.id, 'overpackItemId (pre-filled by 15A) saknas')); continue; }
        const h = harness(); const beforeState = await h.readWmsState(fixtures.packingId, fixtures.overpackItemId); const before = packedOf(beforeState); const required = requiredOf(beforeState);
        if (before === null || required === null || before !== required) { out.push(skip(def.id, 'overpack fixture is not exactly full')); continue; }
        await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.overpackItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-FULL' }) }); await h.drain();
        const after = packedOf(await h.readWmsState(fixtures.packingId, fixtures.overpackItemId));
        out.push(after === before ? pass(def.id) : fail(def.id, `overpack changed canonical state ${before}→${after}`));
        continue;
      }

      if (def.id === 'unknown_product' || def.id === 'ambiguous_serial') {
        const value = def.id === 'unknown_product' ? fixtures.unknownValue : fixtures.ambiguousSerial;
        if (!value) { out.push(skip(def.id, `${def.id} fixture value saknas`)); continue; }
        const h = harness();
        const op = await h.scan({ operation: value === fixtures.ambiguousSerial ? 'pack_instance' : 'pack_quantity', packingId: fixtures.packingId, serialNumber: value === fixtures.ambiguousSerial ? value : undefined, sku: value === fixtures.unknownValue ? value : undefined, quantityDelta: value === fixtures.unknownValue ? 1 : undefined, deviceId: 'A', scanEvent: makeScanEvent({ value }) }); await h.drain();
        const opState = await h.readOperationState(op.operation_id);
        const mutations = canonicalMutationCountOf(opState);
        const r = h.resultFor(op.operation_id);
        if (mutations === null) { out.push(skip(def.id, '15A operation control endpoint exposes no canonical mutation count')); continue; }
        out.push(mutations === 0 && r && !isCommittedResult(r) ? pass(def.id) : fail(def.id, `rejected input mutation_count=${mutations}, status=${r?.status}`));
        continue;
      }

      if (def.id === 'keyboard_fallback') {
        if (!fixtures.quantityItemId) { out.push(skip(def.id, 'quantityItemId saknas')); continue; }
        const h = harness();
        const before = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint returned no packed quantity')); continue; }
        const ev = makeScanEvent({ value: 'SKU-KEY', source: 'keyboard_fallback', input_channel: 'keyboard' });
        const op = await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'keyboard', scanEvent: ev });
        await h.drain();
        const after = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        const opState: any = await h.readOperationState(op.operation_id);
        const persistedSource = opState?.scan_source ?? opState?.scanSource ?? opState?.operation?.scan_source ?? null;
        const r = h.resultFor(op.operation_id);
        if (persistedSource === null) { out.push(skip(def.id, '15A operation endpoint exposes no scan_source')); continue; }
        const gatewayCommitted = isCommittedResult(r);
        out.push(op.scan_event?.source === 'keyboard_fallback' && persistedSource === 'manual' && gatewayCommitted && after === before + 1
          ? pass(def.id, `keyboard source preserved through gateway; ${before}→${after}`)
          : fail(def.id, `keyboard gateway invariant failed; event=${op.scan_event?.source}, persisted=${persistedSource}, status=${r?.status}, qty=${before}→${after}`));
        continue;
      }

      if (def.id === 'projection_drift') {
        if (!fixtures.quantityItemId) { out.push(skip(def.id, 'quantityItemId saknas')); continue; }
        const h = harness();
        const before = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        if (before === null) { out.push(skip(def.id, '15A state endpoint returned no packed quantity')); continue; }
        h.projection = { ...emptyProjectionState(), items: { [fixtures.quantityItemId]: { itemId: fixtures.quantityItemId, packedQuantity: Math.max(0, before - 3), requiredQuantity: Math.max(before + 10, 10) } } };
        await h.scan({ operation: 'pack_quantity', packingId: fixtures.packingId, itemId: fixtures.quantityItemId, quantityDelta: 1, deviceId: 'A', scanEvent: makeScanEvent({ value: 'SKU-DRIFT' }) }); await h.drain();
        const after = packedOf(await h.readWmsState(fixtures.packingId, fixtures.quantityItemId));
        const projected = h.projection.items[fixtures.quantityItemId]?.packedQuantity ?? null;
        out.push(after !== null && projected === after ? pass(def.id, `stale local replaced by authoritative ${after}`) : fail(def.id, `WMS=${after}, Planning projection=${projected}`));
        continue;
      }

      if (def.id === 'legacy_bypass_detection') {
        out.push(skip(def.id, 'requires 15A/Planning runtime trace instrumentation; source-only evidence is not accepted as E2E PASS'));
        continue;
      }

      if (def.id === 'multi_tenant_rejection') {
        if (!fixtures.orgBValue) { out.push(skip(def.id, 'orgBValue saknas')); continue; }
        const h = harness();
        const op = await h.scan({ operation: 'pack_instance', packingId: fixtures.packingId, serialNumber: fixtures.orgBValue, deviceId: 'A', scanEvent: makeScanEvent({ value: fixtures.orgBValue }) }); await h.drain();
        const opState = await h.readOperationState(op.operation_id);
        const mutations = canonicalMutationCountOf(opState);
        const r = h.resultFor(op.operation_id);
        if (mutations === null) { out.push(skip(def.id, '15A operation control endpoint exposes no canonical mutation count')); continue; }
        out.push(mutations === 0 && r && !isCommittedResult(r) ? pass(def.id) : fail(def.id, `tenant rejection mutation_count=${mutations}, status=${r?.status}`));
        continue;
      }

      if (def.id === 'final_reconciliation') {
        const h = harness();
        const state: any = await h.readReconciliation();
        const mismatchCount = typeof state?.mismatch_count === 'number' ? state.mismatch_count : Array.isArray(state?.mismatches) ? state.mismatches.length : null;
        const explicitOk = state?.ok === true || state?.status === 'ok' || state?.status === 'clean';
        if (mismatchCount === null) { out.push(skip(def.id, '15A reconciliation endpoint exposes no mismatch_count/mismatches')); continue; }
        out.push(explicitOk && mismatchCount === 0 ? pass(def.id, 'explicit clean reconciliation') : fail(def.id, `reconciliation mismatch_count=${mismatchCount}, status=${state?.status}`));
        continue;
      }

      out.push(skip(def.id, 'scenario executor requires an additional 15A fixture/control capability'));
    } catch (e: any) {
      out.push(fail(def.id, e?.message || String(e)));
    }
  }
  return out;
}
