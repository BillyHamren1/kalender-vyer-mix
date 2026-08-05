/**
 * STEG 2H — Exklusivt importlås, reservation-token, lease och atomisk commit.
 *
 * Simulerar RPC:n `advance_booking_source_revision` (samma semantik som
 * migrationen) i minnet, inklusive lås-token, lease-utgång, takeover,
 * watermark och atomisk commit (state + spegling + audit i ett steg).
 */
import { describe, it, expect } from 'vitest';
import {
  reserveCanonicalRevision,
  renewCanonicalRevisionLease,
  commitCanonicalRevision,
  releaseCanonicalRevision,
} from '../../supabase/functions/_shared/canonicalRevisionGuard';
import { loadAppliedSourceRevision } from '../../supabase/functions/_shared/appliedSourceRevision';
import { validateSingleBookingResult } from '../../supabase/functions/_shared/singleBookingResult';

const BOOKING = 'b-2h';
const ORG = '00000000-0000-0000-0000-000000000001';

interface Row {
  appliedTs: string | null; appliedVer: number | null; appliedStatus: string | null;
  pendingTs: string | null; pendingVer: number | null; pendingStatus: string | null;
  lockToken: string | null; lockExpiresAtMs: number | null;
  highestTs: string | null; highestVer: number | null;
  takeovers: number;
}

function newRow(init?: Partial<Row>): Row {
  return {
    appliedTs: null, appliedVer: null, appliedStatus: null,
    pendingTs: null, pendingVer: null, pendingStatus: null,
    lockToken: null, lockExpiresAtMs: null,
    highestTs: null, highestVer: null, takeovers: 0,
    ...(init ?? {}),
  };
}

/** Testklocka så att lease-utgång kan simuleras deterministiskt. */
function makeDb(init?: Partial<Row>) {
  const row = newRow(init);
  const clock = { now: 1_000_000 };
  const bookingsMirror: Record<string, any> = {};
  const audit: any[] = [];
  let tokenSeq = 0;
  let failAudit = false;

  const rpc = async (_name: string, a: any) => {
    const ts: string | null = a.p_source_updated_at ?? null;
    const ver: number | null = a.p_source_version ?? null;
    const status: string = a.p_source_status;
    const mode: string = a.p_mode;
    const token: string | null = a.p_reservation_token ?? null;
    const lease = Math.max(a.p_lease_seconds ?? 300, 30) * 1000;
    const lockActive = row.lockToken !== null && (row.lockExpiresAtMs ?? 0) > clock.now;

    if (mode === 'renew') {
      if (!lockActive || !token || row.lockToken !== token) {
        return { data: { decision: 'reservation_lost' }, error: null };
      }
      row.lockExpiresAtMs = clock.now + lease;
      return { data: { decision: 'renewed', reservation_token: row.lockToken }, error: null };
    }

    if (mode === 'release') {
      if (!token || row.lockToken !== token) return { data: { decision: 'not_lock_owner' }, error: null };
      row.pendingTs = row.pendingVer = row.pendingStatus = null as any;
      row.lockToken = null; row.lockExpiresAtMs = null;
      return { data: { decision: 'released' }, error: null };
    }

    if (mode === 'commit') {
      if (!token || row.lockToken !== token || !lockActive) {
        if (row.appliedTs === ts && row.appliedVer === ver && row.appliedStatus === status
            && (row.appliedTs !== null || row.appliedVer !== null)) {
          return { data: { decision: 'already_current' }, error: null };
        }
        return { data: { decision: 'reservation_lost' }, error: null };
      }
      if (row.pendingTs !== ts || row.pendingVer !== ver || row.pendingStatus !== status) {
        return { data: { decision: 'reservation_mismatch' }, error: null };
      }
      if (failAudit) {
        // Samma transaktion → INGEN delvis skrivning (state, spegling, audit).
        return { data: null, error: { message: 'audit_insert_failed' } };
      }
      row.appliedTs = ts; row.appliedVer = ver; row.appliedStatus = status;
      row.pendingTs = row.pendingVer = row.pendingStatus = null as any;
      row.lockToken = null; row.lockExpiresAtMs = null;
      bookingsMirror[BOOKING] = { source_updated_at: ts, source_version: ver, source_status: status };
      audit.push({ ts, ver, status });
      return { data: { decision: 'applied' }, error: null };
    }

    // reserve
    if (lockActive && (!token || row.lockToken !== token)) {
      return { data: { decision: 'booking_import_locked' }, error: null };
    }
    if (row.lockToken !== null && !lockActive) {
      row.takeovers += 1;
      row.lockToken = null; row.lockExpiresAtMs = null;
      row.pendingTs = row.pendingVer = row.pendingStatus = null as any;
    }
    const hasApplied = row.appliedTs !== null || row.appliedVer !== null;
    if (hasApplied) {
      if ((row.appliedTs !== null && ts === null) || (row.appliedVer !== null && ver === null)) {
        return { data: { decision: 'incomparable_source_revision' }, error: null };
      }
      let older = false, newer = false;
      if (row.appliedTs !== null) {
        if (Date.parse(ts!) < Date.parse(row.appliedTs)) older = true;
        if (Date.parse(ts!) > Date.parse(row.appliedTs)) newer = true;
      }
      if (row.appliedVer !== null) {
        if (ver! < row.appliedVer) older = true;
        if (ver! > row.appliedVer) newer = true;
      }
      if (older) return { data: { decision: 'stale_source_revision' }, error: null };
      if (!newer) {
        return row.appliedStatus === status
          ? { data: { decision: 'already_current' }, error: null }
          : { data: { decision: 'conflicting_source_status_for_revision' }, error: null };
      }
    }
    if ((row.highestTs !== null && ts !== null && Date.parse(ts) < Date.parse(row.highestTs))
        || (row.highestVer !== null && ver !== null && ver < row.highestVer)) {
      return { data: { decision: 'stale_source_revision' }, error: null };
    }
    tokenSeq += 1;
    const newToken = `tok-${tokenSeq}`;
    row.pendingTs = ts; row.pendingVer = ver; row.pendingStatus = status;
    row.lockToken = newToken; row.lockExpiresAtMs = clock.now + lease;
    if (ts !== null && (row.highestTs === null || Date.parse(ts) > Date.parse(row.highestTs))) row.highestTs = ts;
    if (ver !== null && (row.highestVer === null || ver > row.highestVer)) row.highestVer = ver;
    return { data: { decision: 'reserved', reservation_token: newToken }, error: null };
  };

  const supabase = { rpc } as any;
  return {
    supabase, row, clock, bookingsMirror, audit,
    setFailAudit: (v: boolean) => { failAudit = v; },
  };
}

const REV = (v: number, status = 'CONFIRMED') => ({ sourceVersion: v, sourceStatus: status });
const base = { bookingId: BOOKING, organizationId: ORG };

describe('STEG 2H – exklusivt importlås per bokning', () => {
  it('Test 1: aktiv reservation kan inte ersättas av nyare revision (retrybart lås)', async () => {
    const db = makeDb();
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
    expect(a.ok && a.decision === 'reserved').toBe(true);

    const b = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.decision).toBe('booking_import_locked');
      expect((b as any).retriable).toBe(true);
    }
    // A:s pending är orörd
    expect(db.row.pendingVer).toBe(19);
  });

  it('Test 2: efter commit kan nyare revision reservera, importera och committa', async () => {
    const db = makeDb();
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
    const aTok = (a as any).reservationToken;
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(19), reservationToken: aTok })).ok).toBe(true);

    const b = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const bTok = (b as any).reservationToken;
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: bTok })).ok).toBe(true);
    expect(db.row.appliedVer).toBe(20);
    expect(db.bookingsMirror[BOOKING].source_version).toBe(20);
  });

  it('Test 3: gammalt token efter takeover kan varken committa eller releasa', async () => {
    const db = makeDb();
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
    const aTok = (a as any).reservationToken;
    db.clock.now += 10 * 60 * 1000; // lease utgången

    const b = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const bTok = (b as any).reservationToken;
    expect(b.ok).toBe(true);
    expect(db.row.takeovers).toBe(1);

    const aCommit = await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(19), reservationToken: aTok });
    expect(aCommit.ok).toBe(false);
    const aRelease = await releaseCanonicalRevision(db.supabase, { ...base, incoming: REV(19), reservationToken: aTok });
    expect(aRelease.ok).toBe(false);
    // B påverkas inte
    expect(db.row.lockToken).toBe(bTok);
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: bTok })).ok).toBe(true);
    expect(db.row.appliedVer).toBe(20);
  });

  it('Test 4: 19 nekas som stale efter att 20 committats', async () => {
    const db = makeDb();
    const b = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: (b as any).reservationToken });
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.decision).toBe('stale_source_revision');
  });

  it('Test 5: commit med fel token nekas', async () => {
    const db = makeDb();
    await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const bad = await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: 'fel-token' });
    expect(bad.ok).toBe(false);
    expect(db.row.appliedVer).toBeNull();
  });

  it('Test 6: release med fel token släpper inte låset', async () => {
    const db = makeDb();
    await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const bad = await releaseCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: 'fel-token' });
    expect(bad.ok).toBe(false);
    expect(db.row.lockToken).not.toBeNull();
    expect(db.row.pendingVer).toBe(20);
  });

  it('Test 7: auditfel lämnar varken spegling eller current state framflyttad', async () => {
    const db = makeDb();
    const r = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    db.setFailAudit(true);
    const c = await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: (r as any).reservationToken });
    expect(c.ok).toBe(false);
    expect(db.row.appliedVer).toBeNull();
    expect(db.bookingsMirror[BOOKING]).toBeUndefined();
    expect(db.audit.length).toBe(0);
  });

  it('Test 8: commitfel ⇒ current state påstår inte att revisionen är applicerad', async () => {
    const db = makeDb();
    await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const c = await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: 'annat' });
    expect(c.ok).toBe(false);
    expect(db.row.appliedVer).toBeNull();
    expect(db.bookingsMirror[BOOKING]).toBeUndefined();
  });

  it('Test 9: revision utan status ⇒ ingen reservation, inget lås', async () => {
    const db = makeDb();
    const res = await reserveCanonicalRevision(db.supabase, { ...base, incoming: { sourceVersion: 20 } as any });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.decision).toBe('invalid_incoming_revision');
    expect(db.row.lockToken).toBeNull();
    expect(db.row.pendingVer).toBeNull();
  });

  it('Test 10: lång import – leasen förnyas och tas inte över', async () => {
    const db = makeDb();
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const tok = (a as any).reservationToken;
    for (let i = 0; i < 5; i++) {
      db.clock.now += 90_000;
      const renewed = await renewCanonicalRevisionLease(db.supabase, { ...base, incoming: REV(20), reservationToken: tok });
      expect(renewed.ok).toBe(true);
      const other = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(21) });
      expect(other.ok).toBe(false);
    }
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: tok })).ok).toBe(true);
  });

  it('Test 11: krasch ⇒ efter lease-expiry kan samma revision retryas med nytt token', async () => {
    const db = makeDb();
    const a = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    const oldTok = (a as any).reservationToken;
    db.clock.now += 10 * 60 * 1000;
    const retry = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    expect(retry.ok).toBe(true);
    const newTok = (retry as any).reservationToken;
    expect(newTok).not.toBe(oldTok);
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: oldTok })).ok).toBe(false);
    expect((await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: newTok })).ok).toBe(true);
  });

  it('Test 12: verkligt överlappande mutationstid – slutstate är revision 20', async () => {
    const db = makeDb();
    const mutated: number[] = [];
    const barrier = { resolve: null as null | (() => void) };
    const waitForBarrier = new Promise<void>((r) => { barrier.resolve = r; });

    // Jobb A (19): reserverar, pausar mitt i "mutationen".
    const jobA = (async () => {
      const r = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
      if (!r.ok) return 'blocked';
      await waitForBarrier;                     // mutationstid överlappar B:s försök
      mutated.push(19);
      const c = await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(19), reservationToken: (r as any).reservationToken });
      return c.ok ? 'applied' : 'failed';
    })();

    // Jobb B (20): försöker mitt under A:s mutation → måste blockeras.
    const jobB = (async () => {
      await Promise.resolve();
      const r = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
      if (!r.ok) return r.decision;
      mutated.push(20);
      await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: (r as any).reservationToken });
      return 'applied';
    })();

    const bResult = await jobB;
    expect(bResult).toBe('booking_import_locked');   // B muterade aldrig under A
    barrier.resolve!();
    expect(await jobA).toBe('applied');
    expect(mutated).toEqual([19]);

    // B retryar efter att A släppt ägarskapet → 20 blir slutstate.
    const r2 = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    expect(r2.ok).toBe(true);
    mutated.push(20);
    await commitCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: (r2 as any).reservationToken });
    expect(db.row.appliedVer).toBe(20);
    expect(db.bookingsMirror[BOOKING].source_version).toBe(20);
    expect(mutated).toEqual([19, 20]);
  });

  it('Test 12b: partial failure på 20 blockerar fortfarande 19 (watermark)', async () => {
    const db = makeDb();
    const r = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) });
    await releaseCanonicalRevision(db.supabase, { ...base, incoming: REV(20), reservationToken: (r as any).reservationToken });
    const older = await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(19) });
    expect(older.ok).toBe(false);
    if (!older.ok) expect(older.decision).toBe('stale_source_revision');
    // Samma revision kan retryas
    expect((await reserveCanonicalRevision(db.supabase, { ...base, incoming: REV(20) })).ok).toBe(true);
  });

  it('Test 13: databasfel mot booking_source_state är fail-closed', async () => {
    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => table === 'booking_source_state'
                ? { data: null, error: { message: 'connection reset' } }
                : { data: null, error: null },
            }),
          }),
        }),
      }),
    };
    const res = await loadAppliedSourceRevision(supabase, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('booking_source_state_read');
      expect(res.retriable).toBe(true);
    }
  });

  it('Test 13b: current state är authoritative före speglingen på bokningen', async () => {
    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => table === 'booking_source_state'
                ? { data: { applied_source_updated_at: null, applied_source_version: 20, applied_source_status: 'CONFIRMED' }, error: null }
                : { data: { last_applied_source_revision: { source_version: 5, source_status: 'CONFIRMED' } }, error: null },
            }),
          }),
        }),
      }),
    };
    const res = await loadAppliedSourceRevision(supabase, BOOKING, ORG);
    expect(res.ok).toBe(true);
    if (res.ok && res.found) expect(res.revision?.sourceVersion).toBe(20);
  });

  it('Test 16: locked/stale/conflict/invalid blir aldrig applied eller completed', () => {
    for (const err of [
      'booking_import_locked',
      'stale_source_revision',
      'conflicting_source_status_for_revision',
      'invalid_incoming_revision',
    ]) {
      const v = validateSingleBookingResult({
        booking_id: BOOKING,
        organization_id: ORG,
        outcome: 'failed',
        completed: false,
        error: err,
      } as any, { bookingId: BOOKING, organizationId: ORG });
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.outcome).not.toBe('applied');
        expect(v.outcome).toBe('failed');
      }
    }
  });
});
