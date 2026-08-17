/**
 * SCANNER HARDENING – STEG 11: kontextmedveten RFID-dedupe.
 *
 * Problemet: dedupe på enbart EPC + tid blockerade legitima flöden, t.ex.
 * PACK följt av snabb UNPACK av samma exemplar inom 5 s.
 *
 * Regel (låst av scannerHardwareReadiness.contract.test.ts):
 * dedupe-nyckeln är EPC + intended action + kontext (packning/session/kolli).
 * Byter operationen action eller kontext är scanningen ALDRIG en dubblett.
 */

export interface RfidDedupeContext {
  epc: string;
  /** Avsedd operation, t.ex. 'increment' | 'decrement_by_serial' | 'physical_return_scan'. */
  action: string;
  packingId?: string | null;
  sessionId?: string | null;
  parcelId?: string | null;
}

export const normalizeEpc = (epc: string): string => epc.toUpperCase().replace(/\s/g, '');

export const rfidDedupeKey = (ctx: RfidDedupeContext): string =>
  [
    normalizeEpc(ctx.epc),
    ctx.action,
    ctx.packingId ?? 'no-packing',
    ctx.sessionId ?? 'no-session',
    ctx.parcelId ?? 'no-parcel',
  ].join('::');

export interface RfidDedupeDecision {
  isDuplicate: boolean;
  key: string;
  reason: 'same_action_within_window' | 'action_changed' | 'context_changed' | 'first_read' | 'window_elapsed';
}

export class RfidDedupeTracker {
  private readonly seen = new Map<string, number>();
  /** Senast sedda action per EPC — används för att förklara varför det INTE är dubblett. */
  private readonly lastByEpc = new Map<string, { key: string; at: number }>();

  constructor(private windowMs = 5000) {}

  setWindow(ms: number) {
    this.windowMs = ms;
  }

  evaluate(ctx: RfidDedupeContext, now: number = Date.now()): RfidDedupeDecision {
    const key = rfidDedupeKey(ctx);
    const epc = normalizeEpc(ctx.epc);
    const prevSameKey = this.seen.get(key);
    const prevAny = this.lastByEpc.get(epc);

    this.seen.set(key, now);
    this.lastByEpc.set(epc, { key, at: now });

    if (prevSameKey !== undefined && now - prevSameKey < this.windowMs) {
      return { isDuplicate: true, key, reason: 'same_action_within_window' };
    }

    if (prevAny && prevAny.key !== key && now - prevAny.at < this.windowMs) {
      // Samma EPC men annan action/kontext → legitim (t.ex. PACK → UNPACK).
      const sameAction = prevAny.key.split('::')[1] === ctx.action;
      return { isDuplicate: false, key, reason: sameAction ? 'context_changed' : 'action_changed' };
    }

    return { isDuplicate: false, key, reason: prevSameKey === undefined ? 'first_read' : 'window_elapsed' };
  }

  /** Anropas t.ex. vid app-resume/reconnect så att gamla fönster inte spökar. */
  reset(): void {
    this.seen.clear();
    this.lastByEpc.clear();
  }

  clearEpc(epc: string): void {
    const n = normalizeEpc(epc);
    for (const key of [...this.seen.keys()]) {
      if (key.startsWith(`${n}::`)) this.seen.delete(key);
    }
    this.lastByEpc.delete(n);
  }
}
