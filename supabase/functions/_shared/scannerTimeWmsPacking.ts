/**
 * Scanner packlist via the same signed Time-WMS projection that Planning
 * already uses for Lager/Time. Read-only; never invents identifiers.
 */
type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface ScannerTimeWmsLine {
  identity_kind: 'reservation_line' | 'package_component';
  physical_kind: 'inventory_type' | 'package_component' | 'package';
  reservation_line_id: string;
  reservation_id: string | null;
  parent_reservation_line_id: string | null;
  package_id: string | null;
  package_component_id: string | null;
  inventory_type_id: string | null;
  /** Canonical owner classification; null must not be inferred as manual. */
  line_type: string | null;
  display_name: string | null;
  quantity_reserved: number | null;
  quantity_picked: number | null;
  /** Owner evidence only: absent fields remain unknown, never inferred from total picked. */
  manual_packed_quantity: number | null;
  allocated_quantity: number | null;
  stock_available_quantity: number | null;
  quantity_returned: number | null;
  packing_date: string | null;
  updated_at: string | null;
  is_packable: boolean;
  packability_source: string | null;
  packability_revision: number | null;
  source: 'time_wms_outbound_projection_v1';
}

export interface ScannerTimeWmsPacking {
  reservationId: string | null;
  reservationStatus: string | null;
  reservationRevision: number | null;
  reservationUpdatedAt: string | null;
  lines: ScannerTimeWmsLine[];
  blockers: { code: string; entity_id: string | null }[];
}

export function mapTimeWmsProjectionForScanner(body: Rec): ScannerTimeWmsPacking {
  const src = rec(body.projection) ?? body;
  const reservation = rec(src.reservation);
  const reservationId = str(src.reservationId) ?? str(src.reservation_id) ?? str(reservation?.id);
  const reservationStatus =
    str(src.reservationStatus) ?? str(src.reservation_status) ?? str(reservation?.status);
  const reservationRevision =
    num(src.revision) ?? num(src.reservationRevision) ?? num(reservation?.revision);
  const reservationUpdatedAt =
    str(src.updatedAt) ?? str(src.updated_at) ?? str(reservation?.updated_at) ?? str(reservation?.updatedAt);
  const rawLines = Array.isArray(src.lines) ? src.lines : Array.isArray(src.rows) ? src.rows : [];
  const blockers: ScannerTimeWmsPacking['blockers'] = [];
  const seen = new Set<string>();
  const lines: ScannerTimeWmsLine[] = [];

  if (!reservationId) blockers.push({ code: 'wms_reservation_id_missing', entity_id: null });
  if (!reservationStatus) blockers.push({ code: 'wms_reservation_status_unknown', entity_id: reservationId });
  if (reservationRevision === null && !reservationUpdatedAt) {
    blockers.push({ code: 'wms_reservation_version_unknown', entity_id: reservationId });
  }

  for (const raw of rawLines) {
    const l = rec(raw);
    if (!l) continue;
    const lineId = str(l.reservationLineId) ?? str(l.reservation_line_id) ?? str(l.lineId);
    if (!lineId) {
      blockers.push({ code: 'wms_incomplete_line_identity', entity_id: null });
      continue;
    }
    const componentId = str(l.packageComponentId) ?? str(l.package_component_id);
    const key = `${lineId}::${componentId ?? ''}`;
    if (seen.has(key)) {
      blockers.push({ code: 'wms_duplicate_line_id', entity_id: lineId });
      continue;
    }
    seen.add(key);
    const isGroup = l.kind === 'group';
    lines.push({
      identity_kind: componentId ? 'package_component' : 'reservation_line',
      physical_kind: isGroup ? 'package' : componentId ? 'package_component' : 'inventory_type',
      reservation_line_id: lineId,
      reservation_id: str(l.reservationId) ?? reservationId,
      parent_reservation_line_id: str(l.parentLineId) ?? str(l.parentReservationLineId),
      package_id: str(l.packageId) ?? str(l.package_id),
      package_component_id: componentId,
      inventory_type_id: str(l.itemTypeId) ?? str(l.inventoryTypeId) ?? str(l.inventory_type_id),
      line_type: str(l.lineType) ?? str(l.line_type),
      display_name: str(l.sourceDisplayName) ?? str(l.label) ?? str(l.name),
      quantity_reserved: num(l.requiredQuantity) ?? num(l.quantity),
      quantity_picked: num(l.packedQuantity) ?? num(l.packed),
      manual_packed_quantity: num(l.manualPackedQuantity),
      allocated_quantity: num(l.allocatedQuantity),
      stock_available_quantity: num(l.stockAvailableQuantity),
      // Returantal behövs bara för retur och blockerar aldrig utleverans.
      quantity_returned: num(l.returnedQuantity) ?? num(l.returned_quantity),
      packing_date: str(l.packingDate) ?? str(l.packing_date) ?? str(src.packingDate),
      updated_at: str(l.updatedAt) ?? str(l.updated_at),
      is_packable: (l.isPackable ?? l.is_packable ?? l.actionable ?? true) !== false,
      packability_source: str(l.packabilitySource) ?? str(l.packability_source),
      packability_revision: num(l.packabilityRevision) ?? num(l.packability_revision),
      source: 'time_wms_outbound_projection_v1',
    });
  }
  return { reservationId, reservationStatus, reservationRevision, reservationUpdatedAt, lines, blockers };
}
