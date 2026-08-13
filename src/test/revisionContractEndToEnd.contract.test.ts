/**
 * STEG 4C — BOOKING SOURCE REVISION, ÄNDE TILL ÄNDE
 *
 * Låser den canonical revisionsmodellen:
 *  - Booking äger revisionen (aldrig Planning-lokal updated_at).
 *  - Strikt, tidszons-deterministisk timestamp-parsning.
 *  - Monotonisk version.
 *  - Exakt definierad 'both'-jämförelse (inkl. divergent → incomparable).
 *  - Equal → idempotent, equal + annan status → conflict.
 *  - Missing/invalid → fail-closed.
 */
import { describe, it, expect } from 'vitest';
import {
  compareIncomingRevision,
  normalizeIncomingRevision,
} from '../../supabase/functions/_shared/canonicalRevisionGuard.ts';
import {
  parseSourceTimestamp,
  parseSourceVersion,
} from '../../supabase/functions/_shared/singleBookingSource.ts';

const CONF = 'CONFIRMED';

/** Speglar extraktionen i import-bookings (canonical row från Booking). */
function incomingFromSourceRow(row: any) {
  return {
    sourceUpdatedAt: row?.updated_at ?? row?.source_updated_at ?? null,
    sourceVersion: row?.version ?? row?.source_version ?? null,
    sourceStatus: row?.status ?? row?.booking_status ?? null,
  };
}

describe('STEG 4C – timestamp ordering', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceStatus: CONF };

  it('nyare timestamp → apply', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-05-01T12:00:01Z', sourceStatus: CONF }, local))
      .toBe('apply');
  });
  it('äldre timestamp → stale', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-05-01T11:59:59Z', sourceStatus: CONF }, local))
      .toBe('stale_source_revision');
  });
  it('millisekundsprecision bevaras i ordningen', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00.500Z', sourceStatus: CONF },
      local,
    )).toBe('apply');
  });
});

describe('STEG 4C – version ordering (monotonic)', () => {
  const local = { sourceVersion: 20, sourceStatus: CONF };

  it('version 21 → apply', () => {
    expect(compareIncomingRevision({ sourceVersion: 21, sourceStatus: CONF }, local)).toBe('apply');
  });
  it('version 19 → stale', () => {
    expect(compareIncomingRevision({ sourceVersion: 19, sourceStatus: CONF }, local))
      .toBe('stale_source_revision');
  });
  it('numerisk sträng jämförs numeriskt, inte lexikografiskt', () => {
    expect(compareIncomingRevision({ sourceVersion: '100', sourceStatus: CONF }, local)).toBe('apply');
  });
  it('negativ/decimal/NaN version → invalid (fail-closed)', () => {
    for (const v of [-1, 1.5, Number.NaN, Infinity, '1.5', '-2', 'abc']) {
      expect(parseSourceVersion(v)).toBeNull();
      expect(compareIncomingRevision({ sourceVersion: v as any, sourceStatus: CONF }, local))
        .toBe('invalid_incoming_revision');
    }
  });
});

describe('STEG 4C – both ordering (exakt definierad)', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: CONF };

  it('båda nyare → apply', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:05:00Z', sourceVersion: 21, sourceStatus: CONF }, local,
    )).toBe('apply');
  });
  it('ett nyare + ett lika → apply', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 21, sourceStatus: CONF }, local,
    )).toBe('apply');
  });
  it('båda äldre → stale', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T11:00:00Z', sourceVersion: 19, sourceStatus: CONF }, local,
    )).toBe('stale_source_revision');
  });
  it('DIVERGENT (äldre ts + nyare version) → incomparable, aldrig stale/apply', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T11:00:00Z', sourceVersion: 21, sourceStatus: CONF }, local,
    )).toBe('incomparable_source_revision');
  });
  it('DIVERGENT (nyare ts + äldre version) → incomparable', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T13:00:00Z', sourceVersion: 19, sourceStatus: CONF }, local,
    )).toBe('incomparable_source_revision');
  });
  it('partiell revision mot lokal both → incomparable (ingen delvis jämförelse)', () => {
    expect(compareIncomingRevision({ sourceVersion: 21, sourceStatus: CONF }, local))
      .toBe('incomparable_source_revision');
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-05-02T12:00:00Z', sourceStatus: CONF }, local))
      .toBe('incomparable_source_revision');
  });
});

describe('STEG 4C – equal revision', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: CONF };

  it('equal + samma status → idempotent (already_current)', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: 'confirmed' }, local,
    )).toBe('already_current');
  });
  it('equal + annan canonical status → conflict', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: 'CANCELLED' }, local,
    )).toBe('conflicting_source_status_for_revision');
  });
  it('lokal revision utan status → conflict (fail-closed)', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceStatus: CONF },
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceStatus: null },
    )).toBe('conflicting_source_status_for_revision');
  });
});

describe('STEG 4C – invalid / null / malformed (fail-closed)', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceStatus: CONF };

  it('malformed timestamp nekas', () => {
    for (const raw of ['not-a-date', 'Jan 2 2026', '2026-13-01T00:00:00Z', '2026-02-31T00:00:00Z', '20260501', '1767225600000', '']) {
      expect(parseSourceTimestamp(raw)).toBeNull();
      expect(compareIncomingRevision({ sourceUpdatedAt: raw, sourceStatus: CONF }, local))
        .toBe('invalid_incoming_revision');
    }
  });
  it('null/undefined revision utan version → invalid', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: null, sourceVersion: null, sourceStatus: CONF }, local))
      .toBe('invalid_incoming_revision');
    expect(normalizeIncomingRevision({ sourceStatus: CONF })).toBeNull();
  });
  it('saknad canonical status → invalid (revision utan status är ofullständig)', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-06-01T00:00:00Z', sourceStatus: '  ' }, local))
      .toBe('invalid_incoming_revision');
  });
  it('icke-strängar (objekt, tal, bool) nekas som timestamp', () => {
    for (const raw of [123 as any, true as any, {} as any, [] as any]) {
      expect(parseSourceTimestamp(raw)).toBeNull();
    }
  });
});

describe('STEG 4C – timezone determinism', () => {
  it('Z, +00:00, +00 och mellanslagsseparator ger samma instant', () => {
    const base = parseSourceTimestamp('2026-05-01T12:00:00Z');
    expect(parseSourceTimestamp('2026-05-01T12:00:00+00:00')).toBe(base);
    expect(parseSourceTimestamp('2026-05-01T12:00:00+00')).toBe(base);
    expect(parseSourceTimestamp('2026-05-01 12:00:00+00')).toBe(base);
    expect(parseSourceTimestamp('2026-05-01t12:00:00z'.toUpperCase())).toBe(base);
  });
  it('offsettad tid jämförs på instant, inte väggklocka', () => {
    expect(parseSourceTimestamp('2026-05-01T14:00:00+02:00'))
      .toBe(parseSourceTimestamp('2026-05-01T12:00:00Z'));
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T14:00:00+02:00', sourceStatus: CONF },
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceStatus: CONF },
    )).toBe('already_current');
  });
  it('naiv tid tolkas som UTC (aldrig serverns lokala tidszon)', () => {
    expect(parseSourceTimestamp('2026-05-01T12:00:00'))
      .toBe(Date.parse('2026-05-01T12:00:00Z'));
    expect(parseSourceTimestamp('2026-05-01')).toBe(Date.parse('2026-05-01T00:00:00Z'));
  });
  it('datum utan tid men med offset är motsägelsefullt → nekas', () => {
    expect(parseSourceTimestamp('2026-05-01+02:00')).toBeNull();
  });
});

describe('STEG 4C – simultaneous updates', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: CONF };

  it('två uppdateringar samma sekund särskiljs av versionen', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 21, sourceStatus: CONF }, local,
    )).toBe('apply');
  });
  it('två uppdateringar samma sekund utan version men med ms särskiljs', () => {
    expect(compareIncomingRevision(
      { sourceUpdatedAt: '2026-05-01T12:00:00.250Z', sourceStatus: CONF },
      { sourceUpdatedAt: '2026-05-01T12:00:00.000Z', sourceStatus: CONF },
    )).toBe('apply');
  });
  it('identisk revision levererad två gånger muterar inte igen', () => {
    const inc = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: CONF };
    expect(compareIncomingRevision(inc, local)).toBe('already_current');
    expect(compareIncomingRevision(inc, local)).toBe('already_current');
  });
});

describe('STEG 4C – Booking äger revisionen', () => {
  const local = { sourceUpdatedAt: '2026-05-01T12:00:00Z', sourceVersion: 20, sourceStatus: CONF };

  it('revisionen läses från source-raden, inte från Planning-lokal data', () => {
    const inc = incomingFromSourceRow({
      id: '2606-24', status: 'CONFIRMED', updated_at: '2026-05-02T08:00:00Z', version: 21,
    });
    expect(inc.sourceUpdatedAt).toBe('2026-05-02T08:00:00Z');
    expect(inc.sourceVersion).toBe(21);
    expect(compareIncomingRevision(inc, local)).toBe('apply');
  });

  it('product-only source change: bumpad revision → apply', () => {
    const inc = incomingFromSourceRow({
      id: '2606-24', status: 'CONFIRMED', updated_at: '2026-05-01T12:00:00Z', version: 21,
      products: [{ sku: 'A', qty: 3 }],
    });
    expect(compareIncomingRevision(inc, local)).toBe('apply');
  });

  it('date-only source change: bumpad revision → apply', () => {
    const inc = incomingFromSourceRow({
      id: '2606-24', status: 'CONFIRMED', updated_at: '2026-05-01T12:30:00Z', version: 21,
      eventdate: '2026-06-01',
    });
    expect(compareIncomingRevision(inc, local)).toBe('apply');
  });

  it('KONTRAKTSBROTT-DETEKTOR: ändrat innehåll utan bumpad revision blir aldrig apply', () => {
    // Om Booking ändrar produkter/datum utan att röra updated_at/version är
    // kontraktet trasigt — Planning får då INTE mutera på gammal revision.
    const inc = incomingFromSourceRow({
      id: '2606-24', status: 'CONFIRMED', updated_at: '2026-05-01T12:00:00Z', version: 20,
      products: [{ sku: 'A', qty: 99 }], eventdate: '2026-07-01',
    });
    expect(compareIncomingRevision(inc, local)).toBe('already_current');
  });
});
