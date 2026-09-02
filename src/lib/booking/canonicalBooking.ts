/**
 * Single source of truth-mappning för bokningsdata.
 *
 * Booking-projektet äger ALLA bokningsfält. Planning äger endast
 * Planning-specifika fält (viewed, assigned_project_*).
 *
 * Mappningen följer Bookings VERIFIERADE kontrakt:
 *  - export_bookings levererar rig_up_time / rig_down_time (ett fält per fas,
 *    ofta i formen "08:00 - 12:00"), map_snapshot_url, client/clientName,
 *    produkter med booking_product_id/product_name/total och bilagor med
 *    file_name/mime_type/public_url/path.
 *  - update-booking-from-planning accepterar rig_up_time/rig_down_time men
 *    INTE rig_start_time, rig_end_time, event_start_time, event_end_time,
 *    rigdown_start_time, rigdown_end_time eller delivery_contact_email.
 *
 * Filen innehåller rena funktioner (inga nätverksanrop) så kontraktet kan
 * testas isolerat.
 */

import type { Booking, BookingProduct, BookingAttachment } from '@/types/booking';

/** Fält Planning får äga lokalt — allt annat är Booking-ägt. */
export const PLANNING_LOCAL_FIELDS = [
  'viewed',
  'assigned_project_id',
  'assigned_project_name',
  'assigned_to_project',
] as const;

export interface PlanningLocalBookingFields {
  viewed?: boolean | null;
  assigned_project_id?: string | null;
  assigned_project_name?: string | null;
  assigned_to_project?: boolean | null;
}

/** Kanonisk booking enligt Bookings export_bookings-kontrakt. */
export interface CanonicalBooking {
  id: string;
  booking_number?: string | null;
  client?: unknown;
  clientName?: string | null;
  title?: string | null;
  rig_up_dates?: string[] | null;
  event_dates?: string[] | null;
  rig_down_dates?: string[] | null;
  rig_up_time?: string | null;
  rig_down_time?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  delivery_geocode?: { lat?: number | null; lng?: number | null } | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  carry_more_than_10m?: boolean | null;
  ground_nails_allowed?: boolean | null;
  exact_time_needed?: boolean | null;
  exact_time_info?: string | null;
  rental_only?: boolean | null;
  internal_notes?: string | null;
  status?: string | null;
  map_snapshot_url?: string | null;
  economics?: unknown;
  products?: any[] | null;
  attachments?: any[] | null;
  [key: string]: unknown;
}

const firstDate = (value: unknown): string => {
  if (Array.isArray(value)) {
    const found = value.find((v) => typeof v === 'string' && v.length > 0);
    return typeof found === 'string' ? found : '';
  }
  return typeof value === 'string' ? value : '';
};

/**
 * Delar Bookings tidsfält ("08:00 - 12:00", "08:00-12:00", "08:00") i start/slut.
 * Saknas slutdel returneras null för slut — vi hittar aldrig på tider.
 */
export const splitTimeRange = (
  value: unknown,
): { start: string | null; end: string | null } => {
  if (typeof value !== 'string') return { start: null, end: null };
  const raw = value.trim();
  if (!raw) return { start: null, end: null };
  const parts = raw.split(/\s*[-–—]\s*|\s+till\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { start: parts[0], end: parts[1] };
  return { start: parts[0] ?? null, end: null };
};

/** Sätter ihop start/slut till Bookings kanoniska tidsformat. */
export const joinTimeRange = (
  start: unknown,
  end: unknown,
): string | null => {
  const s = typeof start === 'string' ? start.trim() : '';
  const e = typeof end === 'string' ? end.trim() : '';
  if (s && e) return `${s} - ${e}`;
  if (s) return s;
  if (e) return e;
  return null;
};

export const clientName = (canonical: CanonicalBooking): string => {
  if (typeof canonical.clientName === 'string' && canonical.clientName) return canonical.clientName;
  const client = canonical.client;
  if (!client) return '';
  if (typeof client === 'string') return client;
  if (typeof client === 'object' && client !== null) {
    const obj = client as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.company_name === 'string') return obj.company_name;
    return '';
  }
  return String(client);
};

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const mapProducts = (rows: any[] | null | undefined): BookingProduct[] | undefined => {
  if (!Array.isArray(rows)) return undefined;
  return rows
    .map((p) => {
      const id = p?.booking_product_id ?? p?.id;
      const name = p?.product_name ?? p?.name ?? '';
      if (id === undefined || id === null || String(id).length === 0) return null;
      const quantity = toNumber(p?.quantity) ?? 0;
      const unitPrice = toNumber(p?.unit_price);
      const total = toNumber(p?.total) ?? toNumber(p?.total_price);
      return {
        id: String(id),
        name: String(name),
        quantity,
        notes: p?.notes ?? undefined,
        unitPrice,
        totalPrice: total,
        parentProductId: p?.parent_product_id ? String(p.parent_product_id) : undefined,
        isPackageComponent: p?.is_package_component === true,
        parentPackageId: p?.inventory_package_id ? String(p.inventory_package_id) : undefined,
        sku: p?.sku ?? undefined,
      } as BookingProduct;
    })
    .filter((p): p is BookingProduct => p !== null && p.name.length > 0);
};

const mapAttachments = (rows: any[] | null | undefined): BookingAttachment[] | undefined => {
  if (!Array.isArray(rows)) return undefined;
  return rows
    .map((a) => {
      const url = a?.public_url ?? a?.url ?? '';
      const id = a?.id ?? a?.path ?? a?.public_url ?? a?.url;
      if (!id) return null;
      return {
        id: String(id),
        url: String(url),
        fileName: a?.file_name ?? a?.fileName ?? '',
        fileType: a?.mime_type ?? a?.file_type ?? '',
      } as BookingAttachment;
    })
    .filter((a): a is BookingAttachment => a !== null);
};

/**
 * Mappar Bookings kanoniska bokning till Plannings UI-typ.
 * Inga Planning-lokala fält sätts här — de läggs på separat.
 */
export const mapCanonicalBookingToPlanning = (canonical: CanonicalBooking): Booking => {
  const geo = canonical.delivery_geocode ?? null;
  const rig = splitTimeRange(canonical.rig_up_time);
  const rigDown = splitTimeRange(canonical.rig_down_time);
  return {
    id: canonical.id,
    bookingNumber: canonical.booking_number ?? undefined,
    client: clientName(canonical),
    rigDayDate: firstDate(canonical.rig_up_dates),
    eventDate: firstDate(canonical.event_dates),
    rigDownDate: firstDate(canonical.rig_down_dates),
    rigStartTime: rig.start,
    rigEndTime: rig.end,
    // Booking saknar kanonisk källa för eventtider — vi hittar aldrig på dem.
    eventStartTime: null,
    eventEndTime: null,
    rigDownStartTime: rigDown.start,
    rigDownEndTime: rigDown.end,
    deliveryAddress: canonical.delivery_address ?? undefined,
    deliveryCity: canonical.delivery_city ?? undefined,
    deliveryPostalCode: canonical.delivery_postal_code ?? undefined,
    deliveryLatitude: geo?.lat ?? undefined,
    deliveryLongitude: geo?.lng ?? undefined,
    contactName: canonical.delivery_contact_name ?? canonical.contact_name ?? undefined,
    contactPhone: canonical.delivery_contact_phone ?? canonical.contact_phone ?? undefined,
    contactEmail: canonical.contact_email ?? undefined,
    carryMoreThan10m: canonical.carry_more_than_10m ?? false,
    groundNailsAllowed: canonical.ground_nails_allowed ?? false,
    exactTimeNeeded: canonical.exact_time_needed ?? false,
    exactTimeInfo: canonical.exact_time_info ?? undefined,
    rentalOnly: canonical.rental_only === true,
    internalNotes: canonical.internal_notes ?? undefined,
    viewed: false,
    status: canonical.status ?? '',
    mapDrawingUrl: canonical.map_snapshot_url ?? undefined,
    economics: (canonical.economics as Booking['economics']) ?? null,
    products: mapProducts(canonical.products),
    attachments: mapAttachments(canonical.attachments),
  };
};

/**
 * Lägger Planning-lokala fält OVANPÅ Booking-datat.
 * Får aldrig ersätta Booking-ägda fält.
 */
export const applyPlanningLocalFields = (
  booking: Booking,
  local: PlanningLocalBookingFields | null | undefined,
): Booking => {
  if (!local) return booking;
  return {
    ...booking,
    viewed: local.viewed ?? booking.viewed,
    assignedProjectId: local.assigned_project_id ?? undefined,
    assignedProjectName: local.assigned_project_name ?? undefined,
    assignedToProject: local.assigned_to_project ?? undefined,
  };
};

/** Planning-fältnamn → Bookings kanoniska namn (endast fält Booking accepterar). */
export const CANONICAL_FIELD_MAP: Record<string, string> = {
  rigdaydate: 'rig_up_dates',
  rig_dates: 'rig_up_dates',
  rig_up_dates: 'rig_up_dates',
  eventdate: 'event_dates',
  event_dates: 'event_dates',
  rigdowndate: 'rig_down_dates',
  rigdown_dates: 'rig_down_dates',
  rig_down_dates: 'rig_down_dates',
  rig_up_time: 'rig_up_time',
  rig_down_time: 'rig_down_time',
  deliveryaddress: 'delivery_address',
  delivery_address: 'delivery_address',
  delivery_city: 'delivery_city',
  delivery_postal_code: 'delivery_postal_code',
  internalnotes: 'internal_notes',
  internal_notes: 'internal_notes',
  contact_name: 'delivery_contact_name',
  contact_phone: 'delivery_contact_phone',
  contact_email: 'contact_email',
  carry_more_than_10m: 'carry_more_than_10m',
  ground_nails_allowed: 'ground_nails_allowed',
  exact_time_needed: 'exact_time_needed',
  exact_time_info: 'exact_time_info',
  rental_only: 'rental_only',
  status: 'status',
};

/** UI-fält som slås ihop till Bookings kanoniska tidsfält. */
const TIME_PAIRS: Record<string, { target: 'rig_up_time' | 'rig_down_time'; part: 'start' | 'end' }> = {
  rig_start_time: { target: 'rig_up_time', part: 'start' },
  rig_end_time: { target: 'rig_up_time', part: 'end' },
  rigdown_start_time: { target: 'rig_down_time', part: 'start' },
  rigdown_end_time: { target: 'rig_down_time', part: 'end' },
};

/** Fält som saknar kanonisk källa i Booking — fail-closed. */
export const UNSUPPORTED_BOOKING_FIELDS = new Set(['event_start_time', 'event_end_time']);

export const EVENT_TIME_UNSUPPORTED_MESSAGE =
  'Eventtider saknar kanonisk källa i Booking och kan inte sparas från Planning.';

const DATE_ARRAY_FIELDS = new Set(['rig_up_dates', 'event_dates', 'rig_down_dates']);

/**
 * Normaliserar en Planning-patch till Bookings kanoniska fältnamn.
 * Datumfält blir alltid arrayer, rig-tider slås ihop till rig_up_time/rig_down_time.
 * Okända eller icke-stödda fält kastar — hela patchen avvisas (inget delvis sparande).
 */
export const toCanonicalBookingFields = (
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const geoKeys = new Set(['delivery_latitude', 'delivery_longitude', 'deliveryLatitude', 'deliveryLongitude']);
  const out: Record<string, unknown> = {};
  const timeParts: Record<string, { start?: unknown; end?: unknown }> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (UNSUPPORTED_BOOKING_FIELDS.has(key)) {
      throw new Error(EVENT_TIME_UNSUPPORTED_MESSAGE);
    }
    if (geoKeys.has(key)) continue;

    const pair = TIME_PAIRS[key];
    if (pair) {
      timeParts[pair.target] = { ...(timeParts[pair.target] ?? {}), [pair.part]: value };
      continue;
    }

    const canonicalKey = CANONICAL_FIELD_MAP[key];
    if (!canonicalKey) {
      throw new Error(`Okänt bokningsfält "${key}" – Planning får inte skriva det till Booking.`);
    }
    if (DATE_ARRAY_FIELDS.has(canonicalKey)) {
      const dates = Array.isArray(value) ? value : value === null ? [] : [value];
      const existing = (out[canonicalKey] as unknown[] | undefined) ?? [];
      out[canonicalKey] = [...existing, ...dates].filter((d) => d !== null && d !== undefined);
    } else {
      out[canonicalKey] = value;
    }
  }

  for (const [target, parts] of Object.entries(timeParts)) {
    out[target] = joinTimeRange(parts.start, parts.end);
  }

  // delivery_latitude/longitude → delivery_geocode
  const lat = patch.delivery_latitude ?? patch.deliveryLatitude;
  const lng = patch.delivery_longitude ?? patch.deliveryLongitude;
  if (lat !== undefined || lng !== undefined) {
    out.delivery_geocode = { lat: (lat as number) ?? null, lng: (lng as number) ?? null };
  }
  return out;
};

/** Fält Planning aldrig får skriva lokalt (Booking-ägda). */
export const isPlanningLocalField = (field: string): boolean =>
  (PLANNING_LOCAL_FIELDS as readonly string[]).includes(field);
