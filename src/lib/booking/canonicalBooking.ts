/**
 * Single source of truth-mappning för bokningsdata.
 *
 * Booking-projektet äger ALLA bokningsfält. Planning äger endast
 * Planning-specifika fält (viewed, assigned_project_*, large_project_id).
 *
 * Den här filen innehåller rena funktioner (inga nätverksanrop) så att
 * kontraktet kan testas isolerat.
 */

import type { Booking, BookingProduct, BookingAttachment } from '@/types/booking';

/** Fält Planning får äga lokalt — allt annat är Booking-ägt. */
export const PLANNING_LOCAL_FIELDS = [
  'viewed',
  'assigned_project_id',
  'assigned_project_name',
  'assigned_to_project',
  'large_project_id',
] as const;

export interface PlanningLocalBookingFields {
  viewed?: boolean | null;
  assigned_project_id?: string | null;
  assigned_project_name?: string | null;
  assigned_to_project?: boolean | null;
  large_project_id?: string | null;
}

/** Kanonisk booking enligt Bookings export_bookings-kontrakt. */
export interface CanonicalBooking {
  id: string;
  booking_number?: string | null;
  client?: unknown;
  title?: string | null;
  rig_up_dates?: string[] | null;
  event_dates?: string[] | null;
  rig_down_dates?: string[] | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rigdown_start_time?: string | null;
  rig_down_start_time?: string | null;
  rigdown_end_time?: string | null;
  rig_down_end_time?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  delivery_geocode?: { lat?: number | null; lng?: number | null } | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_contact_email?: string | null;
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
  map_drawing_url?: string | null;
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

const clientName = (client: unknown): string => {
  if (!client) return '';
  if (typeof client === 'string') return client;
  if (typeof client === 'object' && client !== null && 'name' in (client as any)) {
    return String((client as any).name ?? '');
  }
  return String(client);
};

const mapProducts = (rows: any[] | null | undefined): BookingProduct[] | undefined => {
  if (!Array.isArray(rows)) return undefined;
  return rows.map((p) => ({
    id: String(p.id),
    name: p.name ?? '',
    quantity: typeof p.quantity === 'number' ? p.quantity : Number(p.quantity ?? 0),
    notes: p.notes ?? undefined,
    unitPrice: p.unit_price ?? p.unitPrice ?? undefined,
    totalPrice: p.total_price ?? p.totalPrice ?? undefined,
    parentProductId: p.parent_product_id ?? undefined,
    isPackageComponent: p.is_package_component ?? false,
    parentPackageId: p.parent_package_id ?? undefined,
    sku: p.sku ?? undefined,
  }));
};

const mapAttachments = (rows: any[] | null | undefined): BookingAttachment[] | undefined => {
  if (!Array.isArray(rows)) return undefined;
  return rows.map((a) => ({
    id: String(a.id),
    url: a.url,
    fileName: a.file_name ?? a.fileName ?? '',
    fileType: a.file_type ?? a.fileType ?? '',
  }));
};

/**
 * Mappar Bookings kanoniska bokning till Plannings UI-typ.
 * Inga Planning-lokala fält sätts här — de läggs på separat.
 */
export const mapCanonicalBookingToPlanning = (canonical: CanonicalBooking): Booking => {
  const geo = canonical.delivery_geocode ?? null;
  return {
    id: canonical.id,
    bookingNumber: canonical.booking_number ?? undefined,
    client: clientName(canonical.client),
    rigDayDate: firstDate(canonical.rig_up_dates),
    eventDate: firstDate(canonical.event_dates),
    rigDownDate: firstDate(canonical.rig_down_dates),
    rigStartTime: canonical.rig_start_time ?? null,
    rigEndTime: canonical.rig_end_time ?? null,
    eventStartTime: canonical.event_start_time ?? null,
    eventEndTime: canonical.event_end_time ?? null,
    rigDownStartTime: canonical.rigdown_start_time ?? canonical.rig_down_start_time ?? null,
    rigDownEndTime: canonical.rigdown_end_time ?? canonical.rig_down_end_time ?? null,
    deliveryAddress: canonical.delivery_address ?? undefined,
    deliveryCity: canonical.delivery_city ?? undefined,
    deliveryPostalCode: canonical.delivery_postal_code ?? undefined,
    deliveryLatitude: geo?.lat ?? undefined,
    deliveryLongitude: geo?.lng ?? undefined,
    contactName: canonical.delivery_contact_name ?? canonical.contact_name ?? undefined,
    contactPhone: canonical.delivery_contact_phone ?? canonical.contact_phone ?? undefined,
    contactEmail: canonical.delivery_contact_email ?? canonical.contact_email ?? undefined,
    carryMoreThan10m: canonical.carry_more_than_10m ?? false,
    groundNailsAllowed: canonical.ground_nails_allowed ?? false,
    exactTimeNeeded: canonical.exact_time_needed ?? false,
    exactTimeInfo: canonical.exact_time_info ?? undefined,
    rentalOnly: canonical.rental_only === true,
    internalNotes: canonical.internal_notes ?? undefined,
    viewed: false,
    status: canonical.status ?? '',
    mapDrawingUrl: canonical.map_drawing_url ?? undefined,
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
    largeProjectId: local.large_project_id ?? undefined,
  };
};

/** Planning-fältnamn → Bookings kanoniska namn. */
export const CANONICAL_FIELD_MAP: Record<string, string> = {
  rigdaydate: 'rig_up_dates',
  rig_dates: 'rig_up_dates',
  rig_up_dates: 'rig_up_dates',
  eventdate: 'event_dates',
  event_dates: 'event_dates',
  rigdowndate: 'rig_down_dates',
  rigdown_dates: 'rig_down_dates',
  rig_down_dates: 'rig_down_dates',
  deliveryaddress: 'delivery_address',
  delivery_address: 'delivery_address',
  delivery_city: 'delivery_city',
  delivery_postal_code: 'delivery_postal_code',
  internalnotes: 'internal_notes',
  internal_notes: 'internal_notes',
  contact_name: 'delivery_contact_name',
  contact_phone: 'delivery_contact_phone',
  contact_email: 'delivery_contact_email',
  rig_start_time: 'rig_start_time',
  rig_end_time: 'rig_end_time',
  event_start_time: 'event_start_time',
  event_end_time: 'event_end_time',
  rigdown_start_time: 'rigdown_start_time',
  rigdown_end_time: 'rigdown_end_time',
  carry_more_than_10m: 'carry_more_than_10m',
  ground_nails_allowed: 'ground_nails_allowed',
  exact_time_needed: 'exact_time_needed',
  exact_time_info: 'exact_time_info',
  status: 'status',
};

const DATE_ARRAY_FIELDS = new Set(['rig_up_dates', 'event_dates', 'rig_down_dates']);

/**
 * Normaliserar en Planning-patch till Bookings kanoniska fältnamn.
 * Datumfält blir alltid arrayer. Okända fält kastas (fail-closed).
 */
export const toCanonicalBookingFields = (
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const geoKeys = new Set(['delivery_latitude', 'delivery_longitude', 'deliveryLatitude', 'deliveryLongitude']);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (geoKeys.has(key)) continue;
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
