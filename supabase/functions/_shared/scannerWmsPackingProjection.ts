/**
 * Scanner-only, read-only projection from Bundle/WMS.
 *
 * This module is deliberately separate from Planning's legacy WMS mirror.
 * It never writes Planning rows and never constructs identifiers.
 */
import {
  resolveWmsReservation,
  WMS_BASE_URL,
  type WmsCallDeps,
  type WmsFailureCode,
} from "./wmsPackingList.ts";

export interface ScannerWmsPackingLine {
  reservationLineId: string;
  inventoryTypeId: string;
  displayName: string;
  quantityReserved: number;
  quantityPicked: number;
  /** get-packing-list does not prove a returned quantity. Never assume zero. */
  quantityReturned: null;
  parentReservationLineId: string | null;
  source: "bundle_wms";
}

export type ScannerWmsPackingFailureCode =
  | WmsFailureCode
  | "wms_reservation_mismatch"
  | "wms_duplicate_line_id"
  | "wms_incomplete_line_identity"
  | "wms_invalid_quantity"
  | "wms_package_component_identity_missing";

export type ScannerWmsPackingProjection =
  | {
      ok: true;
      reservationId: string;
      lines: ScannerWmsPackingLine[];
      code: null;
    }
  | {
      ok: false;
      reservationId: string | null;
      lines: [];
      code: ScannerWmsPackingFailureCode;
      error: string;
    };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactOwnerId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function failure(
  reservationId: string | null,
  code: ScannerWmsPackingFailureCode,
  error: string
): ScannerWmsPackingProjection {
  return { ok: false, reservationId, lines: [], code, error };
}

function serverHeaders(deps: WmsCallDeps): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${deps.apiKey}`,
    "x-organization-id": deps.organizationId,
  };
}

/** Returns only a complete physical list with canonical owner IDs. */
export async function fetchScannerWmsPackingProjection(
  bookingNumber: string,
  deps: WmsCallDeps
): Promise<ScannerWmsPackingProjection> {
  const reservation = await resolveWmsReservation(bookingNumber, deps);
  if (!reservation.ok || !reservation.reservationId) {
    return failure(
      null,
      reservation.code ?? "wms_bad_response",
      reservation.error ?? "WMS reservation could not be verified"
    );
  }

  const reservationId = reservation.reservationId;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? WMS_BASE_URL;
  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/get-packing-list?reservation_id=${encodeURIComponent(
        reservationId
      )}`,
      { headers: serverHeaders(deps) }
    );
  } catch (error: unknown) {
    return failure(
      reservationId,
      "wms_unavailable",
      error instanceof Error ? error.message : "network_error"
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Reported as a bad response below.
  }
  const body = record(parsed);
  if (!response.ok) {
    const upstreamError = body ? body.error : null;
    return failure(
      reservationId,
      "wms_unavailable",
      typeof upstreamError === "string"
        ? upstreamError
        : `HTTP ${response.status}`
    );
  }
  if (!body) {
    return failure(
      reservationId,
      "wms_bad_response",
      "WMS packing list is not an object"
    );
  }

  const bodyReservation = record(body.reservation);
  const bodyReservationId = exactOwnerId(bodyReservation?.id);
  if (!bodyReservationId || bodyReservationId !== reservationId) {
    return failure(
      reservationId,
      "wms_reservation_mismatch",
      "Packing-list reservation ID does not match the verified WMS reservation"
    );
  }
  if (!Array.isArray(body.lines)) {
    return failure(
      reservationId,
      "wms_bad_response",
      "WMS packing list has no lines array"
    );
  }

  const rawLines = body.lines;
  const sourceLineIds = new Set<string>();
  for (const value of rawLines) {
    const line = record(value);
    const lineId = exactOwnerId(line?.line_id);
    if (!line || !lineId) {
      return failure(
        reservationId,
        "wms_incomplete_line_identity",
        "WMS packing list contains a line without canonical reservation_line_id"
      );
    }
    if (sourceLineIds.has(lineId)) {
      return failure(
        reservationId,
        "wms_duplicate_line_id",
        `WMS packing list contains duplicate reservation_line_id ${lineId}`
      );
    }
    sourceLineIds.add(lineId);
    if (line.type === "package") {
      return failure(
        reservationId,
        "wms_package_component_identity_missing",
        `Package line ${lineId} has no canonical reservation_line_id per physical component`
      );
    }
    if (line.type !== "item_type" || !exactOwnerId(line.item_type_id)) {
      return failure(
        reservationId,
        "wms_incomplete_line_identity",
        `WMS line ${lineId} has no canonical inventory_type_id`
      );
    }
  }

  const lines: ScannerWmsPackingLine[] = [];
  for (const value of rawLines) {
    const line = record(value)!;
    const reservationLineId = exactOwnerId(line.line_id)!;
    const inventoryTypeId = exactOwnerId(line.item_type_id)!;
    const quantityReserved = nonNegativeInteger(line.required_qty);
    const quantityPicked = nonNegativeInteger(line.packed_count);
    if (
      quantityReserved == null ||
      quantityPicked == null ||
      quantityPicked > quantityReserved
    ) {
      return failure(
        reservationId,
        "wms_invalid_quantity",
        `WMS line ${reservationLineId} has invalid physical quantities`
      );
    }

    const parentReservationLineId =
      line.parent_line_id == null ? null : exactOwnerId(line.parent_line_id);
    if (
      line.parent_line_id != null &&
      (!parentReservationLineId ||
        parentReservationLineId === reservationLineId ||
        !sourceLineIds.has(parentReservationLineId))
    ) {
      return failure(
        reservationId,
        "wms_incomplete_line_identity",
        `WMS line ${reservationLineId} has invalid parent_line_id`
      );
    }

    lines.push({
      reservationLineId,
      inventoryTypeId,
      displayName: typeof line.name === "string" ? line.name : "",
      quantityReserved,
      quantityPicked,
      quantityReturned: null,
      parentReservationLineId,
      source: "bundle_wms",
    });
  }

  if (lines.length === 0) {
    return failure(
      reservationId,
      "wms_bad_response",
      "WMS reservation has no packable lines"
    );
  }
  return { ok: true, reservationId, lines, code: null };
}
