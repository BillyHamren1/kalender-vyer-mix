/**
 * SCANNER HARDENING – STEG 14: rena detektorer. Inga DB-anrop, inga writes.
 */

import type {
  ReconciliationFinding,
  ReconciliationInput,
  ReconciliationReason,
  ReconciliationSeverity,
} from './types';

const key = (bookingId: string, lineId: string, itemId: string) =>
  `${bookingId}::${lineId}::${itemId}`;

const severityFor: Record<ReconciliationReason, ReconciliationSeverity> = {
  quantity_mismatch: 'high',
  wms_allocation_without_planning_projection: 'medium',
  planning_packed_without_wms_state: 'critical',
  instance_allocated_to_multiple_reservations: 'critical',
  allocation_wrong_organization: 'critical',
  packed_exceeds_required: 'high',
  orphan_allocation: 'medium',
  committed_operation_without_canonical_effect: 'high',
  planning_local_allocation_without_wms_truth: 'high',
};

const finding = (
  reason: ReconciliationReason,
  base: Partial<ReconciliationFinding> & { organizationId: string },
  wmsState: string,
  planningState: string,
  detail: string,
): ReconciliationFinding => ({
  organizationId: base.organizationId,
  bookingId: base.bookingId ?? null,
  reservationLineId: base.reservationLineId ?? null,
  itemId: base.itemId ?? null,
  itemInstanceId: base.itemInstanceId ?? null,
  wmsState,
  planningState,
  severity: severityFor[reason],
  reason,
  detail,
});

export const detectFindings = (input: ReconciliationInput): ReconciliationFinding[] => {
  const org = input.organizationId;
  const out: ReconciliationFinding[] = [];

  const wmsByKey = new Map(
    input.wmsItems.map((w) => [key(w.bookingId, w.reservationLineId, w.itemId), w]),
  );
  const planByKey = new Map(
    input.planningItems.map((p) => [key(p.bookingId, p.reservationLineId, p.itemId), p]),
  );

  // 1 + 6: kvantitetsavvikelser och packed > required (WMS canonical).
  for (const w of input.wmsItems) {
    const k = key(w.bookingId, w.reservationLineId, w.itemId);
    const p = planByKey.get(k);
    if (p && p.packedQuantity !== w.packedQuantity) {
      out.push(
        finding(
          'quantity_mismatch',
          { organizationId: org, bookingId: w.bookingId, reservationLineId: w.reservationLineId, itemId: w.itemId },
          `packed=${w.packedQuantity}/${w.requiredQuantity}`,
          `packed=${p.packedQuantity}/${p.requiredQuantity}`,
          'WMS packed quantity skiljer sig från Planning-projektionen.',
        ),
      );
    }
    if (w.packedQuantity > w.requiredQuantity) {
      out.push(
        finding(
          'packed_exceeds_required',
          { organizationId: org, bookingId: w.bookingId, reservationLineId: w.reservationLineId, itemId: w.itemId },
          `packed=${w.packedQuantity}/${w.requiredQuantity}`,
          p ? `packed=${p.packedQuantity}/${p.requiredQuantity}` : 'saknas',
          'WMS packed quantity överstiger required quantity.',
        ),
      );
    }
  }

  // 3: Planning säger packed men WMS canonical state saknas.
  for (const p of input.planningItems) {
    const k = key(p.bookingId, p.reservationLineId, p.itemId);
    if (!wmsByKey.has(k) && p.packedQuantity > 0) {
      out.push(
        finding(
          'planning_packed_without_wms_state',
          { organizationId: org, bookingId: p.bookingId, reservationLineId: p.reservationLineId, itemId: p.itemId },
          'saknas',
          `packed=${p.packedQuantity}/${p.requiredQuantity}`,
          'Planning rapporterar packat utan canonical WMS-state.',
        ),
      );
    }
  }

  // 2 + 5 + 7: allokeringar.
  const activeByInstance = new Map<string, typeof input.wmsAllocations>();
  for (const a of input.wmsAllocations) {
    if (a.organizationId !== org) {
      out.push(
        finding(
          'allocation_wrong_organization',
          {
            organizationId: org,
            bookingId: a.bookingId,
            reservationLineId: a.reservationLineId,
            itemId: a.itemId,
            itemInstanceId: a.itemInstanceId,
          },
          `allocation org=${a.organizationId} active=${a.active}`,
          'n/a',
          'WMS-allokering tillhör annan organisation än körningens scope.',
        ),
      );
      continue;
    }

    const k = key(a.bookingId, a.reservationLineId, a.itemId);
    const p = planByKey.get(k);
    const w = wmsByKey.get(k);

    if (a.active && !w) {
      out.push(
        finding(
          'orphan_allocation',
          {
            organizationId: org,
            bookingId: a.bookingId,
            reservationLineId: a.reservationLineId,
            itemId: a.itemId,
            itemInstanceId: a.itemInstanceId,
          },
          'aktiv allokering utan reservationsrad',
          p ? `packed=${p.packedQuantity}` : 'saknas',
          'Aktiv allokering saknar canonical reservationsrad (orphan).',
        ),
      );
    } else if (a.active && (!p || !(p.allocatedInstanceIds ?? []).includes(a.itemInstanceId))) {
      out.push(
        finding(
          'wms_allocation_without_planning_projection',
          {
            organizationId: org,
            bookingId: a.bookingId,
            reservationLineId: a.reservationLineId,
            itemId: a.itemId,
            itemInstanceId: a.itemInstanceId,
          },
          'aktiv allokering',
          p ? 'instans saknas i projektionen' : 'ingen projektion',
          'WMS har aktiv instansallokering som Planning inte projicerat.',
        ),
      );
    }

    if (a.active) {
      const list = activeByInstance.get(a.itemInstanceId) ?? [];
      list.push(a);
      activeByInstance.set(a.itemInstanceId, list);
    }
  }

  // 4: samma instans aktivt allokerad till flera reservationsrader.
  for (const [instanceId, allocs] of activeByInstance) {
    const lines = new Set(allocs.map((a) => `${a.bookingId}::${a.reservationLineId}`));
    if (lines.size > 1) {
      out.push(
        finding(
          'instance_allocated_to_multiple_reservations',
          {
            organizationId: org,
            bookingId: allocs[0].bookingId,
            reservationLineId: allocs[0].reservationLineId,
            itemId: allocs[0].itemId,
            itemInstanceId: instanceId,
          },
          `aktiv på ${lines.size} reservationsrader: ${[...lines].join(', ')}`,
          'n/a',
          'Samma item_instance är aktivt allokerad till flera reservationsrader.',
        ),
      );
    }
  }

  // 9: Planning-local allokering utan WMS truth.
  const wmsActiveInstanceKeys = new Set(
    input.wmsAllocations
      .filter((a) => a.active)
      .map((a) => `${key(a.bookingId, a.reservationLineId, a.itemId)}::${a.itemInstanceId}`),
  );
  for (const p of input.planningItems) {
    for (const instanceId of p.allocatedInstanceIds ?? []) {
      const k = `${key(p.bookingId, p.reservationLineId, p.itemId)}::${instanceId}`;
      if (!wmsActiveInstanceKeys.has(k)) {
        out.push(
          finding(
            'planning_local_allocation_without_wms_truth',
            {
              organizationId: org,
              bookingId: p.bookingId,
              reservationLineId: p.reservationLineId,
              itemId: p.itemId,
              itemInstanceId: instanceId,
            },
            'ingen aktiv allokering',
            'lokalt allokerad',
            'Planning har lokal instansallokering utan motsvarande WMS-sanning.',
          ),
        );
      }
    }
  }

  // 8: committed scanner-operation utan förväntad canonical effekt.
  for (const op of input.committedOperations ?? []) {
    const k = key(op.bookingId, op.reservationLineId, op.itemId);
    const w = wmsByKey.get(k);
    const expected = op.expectedPackedQuantity;
    const missingEffect =
      !w || (typeof expected === 'number' && w.packedQuantity < expected);
    if (missingEffect) {
      out.push(
        finding(
          'committed_operation_without_canonical_effect',
          {
            organizationId: org,
            bookingId: op.bookingId,
            reservationLineId: op.reservationLineId,
            itemId: op.itemId,
            itemInstanceId: op.itemInstanceId ?? null,
          },
          w ? `packed=${w.packedQuantity}` : 'saknas',
          `operation ${op.operationId} COMMITTED, förväntat packed=${expected ?? 'okänt'}`,
          'Scanner-operation är markerad COMMITTED men canonical effekt saknas.',
        ),
      );
    }
  }

  return out;
};
