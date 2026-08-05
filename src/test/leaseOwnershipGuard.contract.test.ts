/**
 * STEG 2I — Importen stoppas omedelbart om lease-ägarskapet förloras.
 * Test 1–9 enligt uppdraget.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  startLeaseRenewal,
  LeaseOwnershipLostError,
  isOwnershipLostDecision,
} from '../../supabase/functions/_shared/canonicalRevisionGuard';

const INPUT = {
  bookingId: 'b-1',
  organizationId: 'org-1',
  incoming: { sourceUpdatedAt: '2026-01-01T00:00:00Z', sourceVersion: 5, sourceStatus: 'CONFIRMED' },
  reservationToken: 'tok-a',
};

/** Fake supabase som returnerar ett scriptat RPC-svar per anrop. */
function fakeSupabase(script: Array<{ decision?: string; throws?: boolean; error?: string }>) {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    rpc: async (_fn: string, args: any) => {
      calls.push(args.p_mode);
      const step = script[Math.min(i, script.length - 1)];
      i++;
      if (step.throws) throw new Error('network down');
      if (step.error) return { data: null, error: { message: step.error } };
      return { data: { decision: step.decision, reservation_token: 'tok-a' }, error: null };
    },
  };
}

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

const HUGE = 10 ** 9; // gör att timern aldrig hinner trigga i testet

describe('STEG 2I – lease ownership', () => {
  it('Test 1: reservation_lost → assertOwned kastar och commit blockeras', async () => {
    const sb = fakeSupabase([{ decision: 'reservation_lost' }]);
    const c = startLeaseRenewal(sb, INPUT, { intervalMs: HUGE, leaseSeconds: 300, now: clock().now });
    const f = await c.renewNow('mid_import');
    expect(f?.code).toBe('lease_ownership_lost');
    expect(c.hasLostOwnership()).toBe(true);
    expect(() => c.assertOwned('product_sync')).toThrow(LeaseOwnershipLostError);
    c.stop();
  });

  it('Test 2: not_lock_owner → inga fler mutationer tillåts', async () => {
    const sb = fakeSupabase([{ decision: 'not_lock_owner' }]);
    const c = startLeaseRenewal(sb, INPUT, { intervalMs: HUGE, leaseSeconds: 300, now: clock().now });
    await c.renewNow();
    let blocked = 0;
    for (const phase of ['booking_update', 'product_sync', 'calendar_reconcile', 'packing_project']) {
      try { c.assertOwned(phase); } catch { blocked++; }
    }
    expect(blocked).toBe(4);
    expect(c.isStopped()).toBe(true);
    c.stop();
  });

  it('Test 3: tillfälligt RPC-fel nära expiry → fail-closed (unverified)', async () => {
    const k = clock();
    const sb = fakeSupabase([{ error: 'timeout' }]);
    const c = startLeaseRenewal(sb, INPUT, {
      intervalMs: HUGE, leaseSeconds: 60, safetyMarginMs: 15_000, now: k.now,
    });
    // Tidigt fel: tid finns kvar → importen får fortsätta.
    await c.renewNow();
    expect(c.hasLostOwnership()).toBe(false);
    // Nära expiry (60s lease, 15s marginal) → ägarskap kan inte verifieras.
    k.advance(46_000);
    const f = await c.renewNow();
    expect(f?.code).toBe('lease_renewal_unverified');
    expect(() => c.assertOwned('calendar_reconcile')).toThrow(LeaseOwnershipLostError);
    c.stop();
  });

  it('Test 4: takeover (booking_import_locked/mismatch) upptäcks före nästa fas', async () => {
    for (const decision of ['booking_import_locked', 'reservation_mismatch', 'stale_source_revision']) {
      expect(isOwnershipLostDecision(decision)).toBe(true);
      const sb = fakeSupabase([{ decision }]);
      const c = startLeaseRenewal(sb, INPUT, { intervalMs: HUGE, leaseSeconds: 300, now: clock().now });
      await c.renewNow();
      expect(c.failure?.code).toBe('lease_ownership_lost');
      expect(() => c.assertOwned('warehouse_events')).toThrow();
      c.stop();
    }
  });

  it('Test 5: normal förnyelse under lång import → importen kan committa', async () => {
    const k = clock();
    const sb = fakeSupabase([{ decision: 'renewed' }]);
    const c = startLeaseRenewal(sb, INPUT, { intervalMs: HUGE, leaseSeconds: 300, now: k.now });
    for (let i = 0; i < 5; i++) {
      k.advance(60_000);
      const f = await c.renewNow();
      expect(f).toBeNull();
      c.assertOwned('phase');
    }
    // Pre-commit-kontrollen använder samma token.
    expect(sb.calls.every((m) => m === 'renew')).toBe(true);
    expect(c.hasLostOwnership()).toBe(false);
    c.stop();
    expect(c.isStopped()).toBe(true);
  });

  it('assertOwned utan renewal blir fail-closed när verifieringsfönstret passerats', () => {
    const k = clock();
    const sb = fakeSupabase([{ decision: 'renewed' }]);
    const c = startLeaseRenewal(sb, INPUT, {
      intervalMs: HUGE, leaseSeconds: 60, safetyMarginMs: 15_000, now: k.now,
    });
    c.assertOwned('early');
    k.advance(50_000);
    expect(() => c.assertOwned('late')).toThrow(LeaseOwnershipLostError);
    c.stop();
  });
});

// ── Statiska kontrakt mot importflödet ────────────────────────────────────
const SRC = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf8',
);

describe('STEG 2I – import-bookings integration', () => {
  it('Test 6: assertOwned före booking-update, produktsync, kalender, warehouse, packing, bilagor', () => {
    for (const phase of [
      'booking_update', 'booking_insert', 'product_sync', 'attachments',
      'calendar_reconcile', 'warehouse_events', 'packing_project',
    ]) {
      expect(SRC).toContain(`assertLeaseOwned('${phase}')`);
    }
    // Produktsyncen skyddas direkt vid blockets början.
    expect(SRC).toMatch(/if \(needsProductUpdate \|\| !existingBooking\) \{\s*\n\s*assertLeaseOwned\('product_sync'\)/);
  });

  it('Test 7: ägarskap verifieras synkront före commit och blockerar commit', () => {
    const idx = SRC.indexOf("leaseControl.renewNow('pre_commit')");
    const commitIdx = SRC.indexOf('const committed = await commitCanonicalRevision');
    expect(idx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(idx);
    expect(SRC).toContain('error: preCommitFailure.code');
  });

  it('Test 8: renewal-timern stoppas i alla kodvägar (finally)', () => {
    expect(SRC).toMatch(/\} finally \{[\s\S]*stopLeaseRenewal\(\)[\s\S]*\}\n\}\)/);
  });

  it('Test 9: lease_ownership_lost → failed, inte applied/completed, ingen cursorförflyttning', () => {
    expect(SRC).toContain('error instanceof LeaseOwnershipLostError');
    const start = SRC.indexOf('error instanceof LeaseOwnershipLostError');
    const block = SRC.slice(start, start + 1600);
    expect(block).toContain("outcome: 'failed'");
    expect(block).toContain('error: failure.code');
    // Release endast när token fortfarande kan ägas (unverified), aldrig commit.
    expect(block).toContain("failure.kind === 'unverified'");
    expect(block).not.toContain('commitCanonicalRevision');
  });
});
