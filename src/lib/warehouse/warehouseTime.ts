import { DateTime } from 'luxon';

/** All warehouse wall-clock times belong to Stockholm, regardless of device zone. */
export const WAREHOUSE_TIME_ZONE = 'Europe/Stockholm';
type WarehouseTimeInput = string | Date | null | undefined;

function inWarehouseZone(value: WarehouseTimeInput): DateTime | null {
  if (!value) return null;
  const date = value instanceof Date
    ? DateTime.fromJSDate(value, { zone: WAREHOUSE_TIME_ZONE })
    : DateTime.fromISO(value.replace(' ', 'T'), { zone: WAREHOUSE_TIME_ZONE });
  return date.isValid ? date : null;
}

/** Accepts both legacy HH:mm[:ss] fields and full timestamp values. */
export function warehouseTimeOf(value: WarehouseTimeInput): string | null {
  if (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)) {
    return value.slice(0, 5);
  }
  return inWarehouseZone(value)?.toFormat('HH:mm') ?? null;
}

export function warehouseDateOf(value: WarehouseTimeInput): string | null {
  return inWarehouseZone(value)?.toISODate() ?? null;
}

/** Half-open range: DST transition days may contain 23 or 25 hours. */
export function warehouseDayBounds(date: string): { start: string; end: string } {
  const day = DateTime.fromISO(date, { zone: WAREHOUSE_TIME_ZONE }).startOf('day');
  if (!day.isValid) throw new Error('Invalid warehouse date');
  return { start: day.toUTC().toISO()!, end: day.plus({ days: 1 }).toUTC().toISO()! };
}

/** Interpret a datetime-local input in the warehouse zone, never the browser zone. */
export function warehouseLocalToISO(value: string): string {
  const date = DateTime.fromISO(value, { zone: WAREHOUSE_TIME_ZONE });
  // Luxon normalizes nonexistent spring-forward times; reject instead of silently moving work.
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value.slice(0, 16)) {
    throw new Error('Tiden finns inte i lagrets tidszon');
  }
  const alternatives = date.getPossibleOffsets();
  if (alternatives.length > 1) throw new Error('Tiden är tvetydig vid byte till vintertid. Välj en annan tid.');
  return date.toUTC().toISO()!;
}

export const warehouseLocalToIso = (date: string, time: string): string =>
  warehouseLocalToISO(`${date}T${time}`);
