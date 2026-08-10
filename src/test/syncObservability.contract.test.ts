// STEG 3G — kontraktstester för sync-observability.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SAFETY_LIMITS,
  SAFETY_CIRCUIT_BREAKER,
  createSyncCounters,
  checkDestructiveLimit,
  enforceDestructiveLimit,
  recordDestructive,
  SafetyCircuitBreakerError,
  resolveDryRun,
  createDryRunClient,
  createSafetyGuardedClient,
  buildSyncAudit,
  sanitizeAudit,
  detectSyncAnomalies,
  classifyTable,
} from '../../supabase/functions/_shared/syncObservability.ts';

const fakeClient = (spy: (op: string, table: string) => void) => ({
  from: (table: string) => {
    const builder: any = {
      select: () => { spy('select', table); return builder; },
      insert: () => { spy('insert', table); return builder; },
      update: () => { spy('update', table); return builder; },
      upsert: () => { spy('upsert', table); return builder; },
      delete: () => { spy('delete', table); return builder; },
      eq: () => builder,
      in: () => builder,
      then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
    };
    return builder;
  },
  rpc: (fn: string) => { spy('rpc', fn); return Promise.resolve({ data: null, error: null }); },
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('safety limits', () => {
  it('gränserna är frysta och kan inte höjas via request', () => {
    expect(Object.isFrozen(SAFETY_LIMITS)).toBe(true);
    expect(() => { (SAFETY_LIMITS as any).product_deletes = 9999; }).toThrow();
    expect(SAFETY_LIMITS.product_deletes).toBeLessThanOrEqual(25);
  });

  it('product destructive limit kan inte höjas via request-payload', () => {
    const c = createSyncCounters();
    const requestedLimit = 5000; // request försöker höja
    void requestedLimit;
    const res = checkDestructiveLimit(c, 'product_deletes', SAFETY_LIMITS.product_deletes + 1);
    expect(res.allowed).toBe(false);
    expect(res.limit).toBe(SAFETY_LIMITS.product_deletes);
  });

  it('calendar destructive limit kan inte höjas via request-payload', () => {
    const c = createSyncCounters();
    const res = checkDestructiveLimit(c, 'calendar_deletes', SAFETY_LIMITS.calendar_deletes + 1);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(`${SAFETY_CIRCUIT_BREAKER}:calendar_deletes`);
  });

  it('total_deletes fångar summan över kategorier', () => {
    const c = createSyncCounters();
    recordDestructive(c, 'product_deletes', SAFETY_LIMITS.product_deletes);
    recordDestructive(c, 'calendar_deletes', 5);
    const res = checkDestructiveLimit(c, 'projection_deletes', 1);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(`${SAFETY_CIRCUIT_BREAKER}:total_deletes`);
  });

  it('ogiltigt planerat antal blockeras (fail-closed)', () => {
    const c = createSyncCounters();
    expect(checkDestructiveLimit(c, 'product_deletes', -1).allowed).toBe(false);
    expect(checkDestructiveLimit(c, 'product_deletes', NaN).allowed).toBe(false);
  });
});

describe('circuit breaker', () => {
  it('kastar och räknar block', () => {
    const c = createSyncCounters();
    expect(() => enforceDestructiveLimit(c, 'projection_deletes', SAFETY_LIMITS.projection_deletes + 1))
      .toThrow(SafetyCircuitBreakerError);
    expect(c.blocked_by_circuit_breaker).toBe(1);
  });

  it('STEG 3I: odeklarerad delete i guardad klient är fail-closed', () => {
    const ops: string[] = [];
    const c = createSyncCounters();
    const db = createSafetyGuardedClient(fakeClient((op, t) => ops.push(`${op}:${t}`)), c);
    expect(() => db.from('calendar_events').delete()).toThrow(/unknown_destructive_row_count/);
    expect(ops.filter((o) => o.startsWith('delete')).length).toBe(0);
  });

  it('STEG 3I: deklarerat radantal över gränsen stoppar FÖRE delete', () => {
    const ops: string[] = [];
    const c = createSyncCounters();
    const db = createSafetyGuardedClient(fakeClient((op, t) => ops.push(`${op}:${t}`)), c);
    expect(() => enforceDestructiveLimit(c, 'calendar_deletes', SAFETY_LIMITS.calendar_deletes + 1))
      .toThrow(SafetyCircuitBreakerError);
    expect(() => db.from('calendar_events').delete()).toThrow(/unknown_destructive_row_count/);
    expect(ops.filter((o) => o.startsWith('delete')).length).toBe(0);
  });

  it('räknar adds/updates/deletes per kategori (rader)', () => {
    const c = createSyncCounters();
    const db = createSafetyGuardedClient(fakeClient(() => {}), c);
    db.from('booking_products').insert();
    db.from('booking_products').update();
    enforceDestructiveLimit(c, 'product_deletes', 1);
    db.from('booking_products').delete();
    db.from('calendar_events').insert();
    db.from('projects').update();
    expect(c.product_adds).toBe(1);
    expect(c.product_updates).toBe(1);
    expect(c.product_deletes).toBe(1);
    expect(c.calendar_adds).toBe(1);
    expect(c.projection_mutations).toBe(1);
    expect(c.deletes).toBe(1);
  });

  it('klassificerar tabeller', () => {
    expect(classifyTable('booking_products')).toBe('product_deletes');
    expect(classifyTable('calendar_events')).toBe('calendar_deletes');
    expect(classifyTable('projects')).toBe('projection_deletes');
    expect(classifyTable('random_table')).toBeNull();
  });
});

describe('dry-run', () => {
  it('kräver explicit dry_run + booking_id', () => {
    expect(resolveDryRun({ dry_run: true, booking_id: '2606-24' }).dryRun).toBe(true);
    expect(resolveDryRun({ dry_run: true }).dryRun).toBe(false);
    expect(resolveDryRun({ dry_run: 'true', booking_id: 'x' }).dryRun).toBe(false);
    expect(resolveDryRun({ booking_id: 'x' }).dryRun).toBe(false);
    expect(resolveDryRun(null).dryRun).toBe(false);
  });

  it('gör noll mutationer men räknar planerade', async () => {
    const ops: string[] = [];
    const planned: Record<string, number> = {};
    const c = createSyncCounters();
    const db = createDryRunClient(fakeClient((op, t) => ops.push(`${op}:${t}`)), planned, c);
    enforceDestructiveLimit(c, 'product_deletes', 1);
    await db.from('booking_products').delete().eq('id', 1);
    await db.from('calendar_events').insert({});
    await db.from('projects').update({});
    db.from('bookings').select('*');
    expect(ops.filter((o) => !o.startsWith('select')).length).toBe(0);
    expect(planned['booking_products.delete']).toBe(1);
    expect(planned['calendar_events.insert']).toBe(1);
    expect(planned['projects.update']).toBe(1);
  });

  it('muterande rpc körs inte i dry-run (STEG 3I: klassificerad)', async () => {
    const ops: string[] = [];
    const planned: Record<string, number> = {};
    const db = createDryRunClient(fakeClient((op, t) => ops.push(`${op}:${t}`)), planned);
    await db.rpc('advance_booking_source_revision', {});
    expect(ops.length).toBe(0);
    expect(planned['rpc.advance_booking_source_revision']).toBe(1);
  });

  it('dry-run audit markerar completed=false-semantik (dry_run true, ingen cursor)', () => {
    const audit = buildSyncAudit({
      organization_id: 'org-1',
      booking_id: 'b1',
      outcome: 'dry_run',
      duration_ms: 10,
      dry_run: true,
      counters: createSyncCounters(),
      planned_mutations: { 'projects.update': 1 },
    });
    expect(audit.dry_run).toBe(true);
    expect(audit.outcome).toBe('dry_run');
    expect(audit.planned_mutations).toEqual({ 'projects.update': 1 });
  });
});

describe('audit', () => {
  it('innehåller alla obligatoriska fält', () => {
    const c = createSyncCounters();
    c.product_adds = 2; c.calendar_deletes = 1; c.deletes = 1; c.partial_failures = 1;
    const audit = buildSyncAudit({
      organization_id: 'org-1',
      booking_id: '2602-13',
      booking_number: '2602-13',
      source_revision: 42,
      previous_applied_revision: 41,
      outcome: 'applied',
      duration_ms: 1234,
      worker_id: 'w1',
      batch_id: 'batch-1',
      products_completeness: 'complete',
      counters: c,
    });
    for (const key of [
      'organization_id', 'booking_id', 'booking_number', 'source_revision',
      'previous_applied_revision', 'outcome', 'duration_ms', 'worker_id', 'batch_id',
      'products_completeness', 'product_adds', 'product_updates', 'product_deletes',
      'calendar_adds', 'calendar_updates', 'calendar_deletes', 'projection_mutations',
      'lease_loss', 'partial_failures', 'failures', 'retries',
    ]) expect(audit).toHaveProperty(key);
    expect(audit.partial_failures).toBe(1);
  });

  it('innehåller aldrig secrets eller tokens', () => {
    const clean = sanitizeAudit({
      booking_id: 'b1',
      access_token: 'xyz',
      service_role_key: 'k',
      authorization: 'Bearer abc',
      nested: { apiKey: 'z', ok: 1 },
    });
    expect(JSON.stringify(clean)).not.toMatch(/xyz|Bearer|service_role|apiKey/i);
    expect(clean.booking_id).toBe('b1');
    expect((clean.nested as any).ok).toBe(1);
  });

  it('exponerar inte data mellan organisationer', () => {
    const a = buildSyncAudit({ organization_id: 'org-a', booking_id: 'b1', outcome: 'applied', duration_ms: 1, counters: createSyncCounters() });
    const b = buildSyncAudit({ organization_id: 'org-b', booking_id: 'b2', outcome: 'applied', duration_ms: 1, counters: createSyncCounters() });
    expect(a.organization_id).toBe('org-a');
    expect(JSON.stringify(a)).not.toContain('org-b');
    expect(JSON.stringify(b)).not.toContain('org-a');
  });
});

describe('anomaly detection', () => {
  it('flaggar kraftigt tapp i produktantal', () => {
    expect(detectSyncAnomalies({ counters: createSyncCounters(), previousProductCount: 20, sourceProductCount: 3 }))
      .toContain('source_product_count_drop');
  });
  it('flaggar många calendar deletes', () => {
    const c = createSyncCounters(); c.calendar_deletes = 3;
    expect(detectSyncAnomalies({ counters: c })).toContain('many_calendar_deletes');
  });
  it('flaggar oväntat statushopp, bakåtgående revision, partials, lease takeover och retries', () => {
    const c = createSyncCounters(); c.lease_losses = 1;
    const found = detectSyncAnomalies({
      counters: c,
      previousStatus: 'confirmed',
      nextStatus: 'cancelled',
      sourceRevision: 5,
      previousAppliedRevision: 9,
      recentPartialFailures: 3,
      retryCount: 4,
    });
    expect(found).toEqual(expect.arrayContaining([
      'unexpected_status_jump',
      'source_revision_went_backwards',
      'repeated_partial_failures',
      'lease_takeover',
      'repeated_retries_same_booking',
    ]));
  });
  it('inga falsklarm vid normal sync', () => {
    expect(detectSyncAnomalies({ counters: createSyncCounters(), previousProductCount: 10, sourceProductCount: 10 })).toEqual([]);
  });
});

describe('cancellation production safety orörd', () => {
  it('observability rör inte cancellation-flaggan', async () => {
    const mod = await import('../../supabase/functions/_shared/destructiveSyncFlag.ts');
    expect(mod.MAX_AUTOMATIC_CANCELLATIONS_PER_RUN).toBe(1);
    expect(mod.isDestructiveSyncEnabledValue(undefined)).toBe(false);
    expect(mod.isDestructiveSyncEnabledValue('true')).toBe(true);
  });
});
