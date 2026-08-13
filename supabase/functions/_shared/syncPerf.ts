/**
 * STEG 4E – Performance-instrumentering för Booking → Planning-sync.
 *
 * Ren mätning: ändrar ALDRIG affärslogik, ordning eller felhantering.
 * Loggar endast räknare/durationer — aldrig kundnamn, adresser eller
 * annan känslig data (endast booking_id, som redan finns i övriga loggar).
 */

export type SyncPhase =
  | 'fetch_external'
  | 'existing_bookings_read'
  | 'booking_upsert'
  | 'products'
  | 'calendar'
  | 'warehouse'
  | 'packing'
  | 'projection'
  | 'attachments'
  | 'other';

export interface BookingPerfMetrics {
  booking_id: string;
  queries: number;
  reads: number;
  writes: number;
  products_count: number;
  calendar_events_count: number;
  packing_items_count: number;
  duration_ms: number;
  phases: Record<string, number>;
}

export interface SyncPerfSnapshot {
  bookings: number;
  total_queries: number;
  total_duration_ms: number;
  phases: Record<string, number>;
  queries_per_booking_avg: number;
  queries_per_booking_max: number;
  worst_booking_id: string | null;
  per_booking: BookingPerfMetrics[];
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const emptyMetrics = (bookingId: string): BookingPerfMetrics => ({
  booking_id: bookingId,
  queries: 0,
  reads: 0,
  writes: 0,
  products_count: 0,
  calendar_events_count: 0,
  packing_items_count: 0,
  duration_ms: 0,
  phases: {},
});

export class SyncPerfTracker {
  private readonly startedAt = now();
  private readonly perBooking = new Map<string, BookingPerfMetrics>();
  private readonly phaseTotals: Record<string, number> = {};
  private current: string | null = null;
  private currentStart = 0;

  constructor(public readonly enabled: boolean = true) {}

  beginBooking(bookingId: string): void {
    if (!this.enabled || !bookingId) return;
    // Avslutar automatiskt föregående bokning (loopen kan avbrytas med `continue`).
    if (this.current) this.endBooking();
    if (!this.perBooking.has(bookingId)) this.perBooking.set(bookingId, emptyMetrics(bookingId));
    this.current = bookingId;
    this.currentStart = now();
  }

  endBooking(): void {
    if (!this.enabled || !this.current) return;
    const m = this.perBooking.get(this.current);
    if (m) m.duration_ms += now() - this.currentStart;
    this.current = null;
  }

  /** Räknar en query. kind används endast för read/write-statistik. */
  countQuery(kind: 'read' | 'write' = 'read', bookingId?: string): void {
    if (!this.enabled) return;
    const id = bookingId ?? this.current;
    if (!id) return;
    const m = this.perBooking.get(id) ?? emptyMetrics(id);
    m.queries += 1;
    if (kind === 'write') m.writes += 1;
    else m.reads += 1;
    this.perBooking.set(id, m);
  }

  setCount(
    field: 'products_count' | 'calendar_events_count' | 'packing_items_count',
    value: number,
    bookingId?: string,
  ): void {
    if (!this.enabled) return;
    const id = bookingId ?? this.current;
    if (!id) return;
    const m = this.perBooking.get(id) ?? emptyMetrics(id);
    m[field] = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    this.perBooking.set(id, m);
  }

  /** Mäter en fas. Kastar vidare fel oförändrat (ingen semantikändring). */
  async phase<T>(phase: SyncPhase, fn: () => Promise<T>, bookingId?: string): Promise<T> {
    if (!this.enabled) return await fn();
    const start = now();
    try {
      return await fn();
    } finally {
      const ms = now() - start;
      this.phaseTotals[phase] = (this.phaseTotals[phase] ?? 0) + ms;
      const id = bookingId ?? this.current;
      if (id) {
        const m = this.perBooking.get(id) ?? emptyMetrics(id);
        m.phases[phase] = (m.phases[phase] ?? 0) + ms;
        this.perBooking.set(id, m);
      }
    }
  }

  snapshot(): SyncPerfSnapshot {
    const per = Array.from(this.perBooking.values());
    const total = per.reduce((sum, m) => sum + m.queries, 0);
    let worst: BookingPerfMetrics | null = null;
    for (const m of per) if (!worst || m.queries > worst.queries) worst = m;
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      bookings: per.length,
      total_queries: total,
      total_duration_ms: round(now() - this.startedAt),
      phases: Object.fromEntries(Object.entries(this.phaseTotals).map(([k, v]) => [k, round(v)])),
      queries_per_booking_avg: per.length ? round(total / per.length) : 0,
      queries_per_booking_max: worst?.queries ?? 0,
      worst_booking_id: worst?.booking_id ?? null,
      per_booking: per.map((m) => ({ ...m, duration_ms: round(m.duration_ms) })),
    };
  }

  /** Kompakt logg utan känslig data. */
  logSummary(prefix = '[sync-perf]'): void {
    if (!this.enabled) return;
    const s = this.snapshot();
    console.log(
      `${prefix} bookings=${s.bookings} queries=${s.total_queries} avg/booking=${s.queries_per_booking_avg} max/booking=${s.queries_per_booking_max} duration_ms=${s.total_duration_ms} phases=${JSON.stringify(s.phases)}`,
    );
  }
}

/** Global av/på — verbose per-produkt-loggning är dyrt och default AV. */
export function verboseProductLogging(): boolean {
  try {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any)?.Deno?.env;
    return env?.get?.('SYNC_DEBUG_PRODUCTS') === 'true';
  } catch {
    return false;
  }
}
