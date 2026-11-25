// Lagernotiser för ändrade bokningsdatum (warehouse_project_changes,
// change_type='booking_date_changed'). Ren informationsnotis — aldrig ett
// godkännandekrav. Bokningens datum är redan uppdaterade när notisen skapas.

export interface BookingDateChangeNotice {
  id: string;
  booking_id: string | null;
  booking_number: string | null;
  packing_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  source_revision: string | null;
  created_at: string;
}

export interface BookingDateChangeGroup {
  key: string;
  bookingId: string | null;
  bookingNumber: string | null;
  packingId: string | null;
  createdAt: string;
  ids: string[];
  changes: Array<{ label: string; oldValue: string | null; newValue: string | null }>;
}

const FIELD_LABEL: Record<string, string> = {
  rigdaydate: 'Rigg',
  eventdate: 'Event',
  rigdowndate: 'Riv',
  rig_start_time: 'Rigg start',
  rig_end_time: 'Rigg slut',
  event_start_time: 'Event start',
  event_end_time: 'Event slut',
  rigdown_start_time: 'Riv start',
  rigdown_end_time: 'Riv slut',
};
const FIELD_ORDER = ['rigdaydate', 'rig_start_time', 'rig_end_time', 'eventdate', 'event_start_time', 'event_end_time', 'rigdowndate', 'rigdown_start_time', 'rigdown_end_time'];

export const dateFieldLabel = (field: string | null) => (field && FIELD_LABEL[field]) || field || 'Datum';

/** En grupp per bokning + källrevision, fält i ordningen rigg/event/riv. */
export function groupBookingDateChanges(rows: BookingDateChangeNotice[]): BookingDateChangeGroup[] {
  const groups = new Map<string, BookingDateChangeGroup>();
  for (const r of rows) {
    const key = `${r.booking_id ?? r.id}|${r.source_revision ?? r.id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, bookingId: r.booking_id, bookingNumber: r.booking_number, packingId: r.packing_id, createdAt: r.created_at, ids: [], changes: [] };
      groups.set(key, g);
    }
    g.ids.push(r.id);
    if (r.created_at > g.createdAt) g.createdAt = r.created_at;
    g.changes.push({ label: dateFieldLabel(r.field_name), oldValue: r.old_value, newValue: r.new_value });
  }
  for (const g of groups.values()) {
    g.changes.sort((a, b) => FIELD_ORDER.indexOf(keyOfLabel(a.label)) - FIELD_ORDER.indexOf(keyOfLabel(b.label)));
  }
  return [...groups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function keyOfLabel(label: string) {
  return Object.keys(FIELD_LABEL).find((k) => FIELD_LABEL[k] === label) ?? label;
}

export function bookingDateNoticeLink(g: Pick<BookingDateChangeGroup, 'packingId' | 'bookingId'>): string | null {
  if (g.packingId) return `/warehouse/packing/${g.packingId}`;
  if (g.bookingId) return `/warehouse/bookings/${encodeURIComponent(g.bookingId)}`;
  return null;
}
