/**
 * STEG 2K — fail-closed revisionstypkontroll i apply_booking_cancellation_atomic.
 *
 * Testerna körs mot:
 *  a) den faktiska migrations-SQL:en (statisk granskning av policyn), och
 *  b) en 1:1-port av RPC:ns beslutslogik (beteendetester 1–14).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGDIR = path.join(process.cwd(), 'supabase/migrations');
const FILES = fs
  .readdirSync(MIGDIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const SQL_2K = FILES.map((f) => fs.readFileSync(path.join(MIGDIR, f), 'utf8'))
  .filter((s) => s.includes('incomparable_source_revision_kind'))
  .join('\n');

// ── Port av RPC:ns revisionsbeslut (samma ordning som i SQL) ──────────────
type Kind = 'timestamp' | 'version' | 'both' | null | string;
interface State {
  applied_source_updated_at?: string | null;
  applied_source_version?: number | null;
  applied_source_status?: string | null;
  revision_kind?: Kind;
}
interface Incoming {
  source_updated_at?: string | null;
  source_version?: number | null;
}
type Decision =
  | { outcome: 'proceed' }
  | { outcome: 'already_cancelled' }
  | { outcome: 'stale_revision' }
  | { outcome: 'revision_conflict'; error: string };

function decide(state: State, incoming: Incoming): Decision {
  const inTs = incoming.source_updated_at ?? null;
  const inVer = incoming.source_version ?? null;
  const kind: Kind = inTs !== null && inVer !== null ? 'both' : inTs !== null ? 'timestamp' : 'version';

  const hasApplied = (state.applied_source_updated_at ?? null) !== null || (state.applied_source_version ?? null) !== null;
  if (!hasApplied) return { outcome: 'proceed' };

  const stateKind = (state.revision_kind ?? '').toString().trim().toLowerCase() || null;
  if (!stateKind || !['timestamp', 'version', 'both'].includes(stateKind)) {
    return { outcome: 'revision_conflict', error: 'stored_revision_kind_missing' };
  }
  if (stateKind === 'both' && ((state.applied_source_updated_at ?? null) === null || (state.applied_source_version ?? null) === null)) {
    return { outcome: 'revision_conflict', error: 'incomplete_composite_revision' };
  }
  if (
    (stateKind === 'timestamp' && (state.applied_source_updated_at ?? null) === null) ||
    (stateKind === 'version' && (state.applied_source_version ?? null) === null)
  ) {
    return { outcome: 'revision_conflict', error: 'stored_revision_kind_missing' };
  }
  if (stateKind !== kind) {
    return { outcome: 'revision_conflict', error: 'incomparable_source_revision_kind' };
  }

  const cmp = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  let same = false;
  if (kind === 'both') {
    if (inTs === null || inVer === null) return { outcome: 'revision_conflict', error: 'incomplete_composite_revision' };
    const tsCmp = cmp(Date.parse(inTs), Date.parse(state.applied_source_updated_at as string));
    const verCmp = cmp(inVer, state.applied_source_version as number);
    if ((tsCmp > 0 && verCmp < 0) || (tsCmp < 0 && verCmp > 0)) {
      return { outcome: 'revision_conflict', error: 'inconsistent_composite_revision' };
    }
    if (tsCmp < 0 || verCmp < 0) return { outcome: 'stale_revision' };
    same = tsCmp === 0 && verCmp === 0;
  } else if (kind === 'timestamp') {
    const tsCmp = cmp(Date.parse(inTs as string), Date.parse(state.applied_source_updated_at as string));
    if (tsCmp < 0) return { outcome: 'stale_revision' };
    same = tsCmp === 0;
  } else {
    const verCmp = cmp(inVer as number, state.applied_source_version as number);
    if (verCmp < 0) return { outcome: 'stale_revision' };
    same = verCmp === 0;
  }

  if (same) {
    if ((state.applied_source_status ?? '').toUpperCase() === 'CANCELLED') return { outcome: 'already_cancelled' };
    return { outcome: 'revision_conflict', error: 'same_revision_applied_with_active_status' };
  }
  return { outcome: 'proceed' };
}

const T1 = '2026-08-01T10:00:00Z';
const T2 = '2026-08-02T10:00:00Z';

describe('STEG 2K – revisionstypspolicy (beteende)', () => {
  it('Test 1: lokal timestamp + inkommande timestamp → normal jämförelse', () => {
    const s: State = { applied_source_updated_at: T1, revision_kind: 'timestamp', applied_source_status: 'CONFIRMED' };
    expect(decide(s, { source_updated_at: T2 }).outcome).toBe('proceed');
    expect(decide(s, { source_updated_at: '2026-07-01T10:00:00Z' }).outcome).toBe('stale_revision');
  });

  it('Test 2: lokal version + inkommande version → normal jämförelse', () => {
    const s: State = { applied_source_version: 10, revision_kind: 'version', applied_source_status: 'CONFIRMED' };
    expect(decide(s, { source_version: 11 }).outcome).toBe('proceed');
    expect(decide(s, { source_version: 9 }).outcome).toBe('stale_revision');
  });

  it('Test 3: lokal timestamp + inkommande both → nekas', () => {
    const d = decide({ applied_source_updated_at: T1, revision_kind: 'timestamp' }, { source_updated_at: T1, source_version: 20 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'incomparable_source_revision_kind' });
  });

  it('Test 4: lokal version + inkommande both → nekas', () => {
    const d = decide({ applied_source_version: 5, revision_kind: 'version' }, { source_updated_at: T2, source_version: 6 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'incomparable_source_revision_kind' });
  });

  it('Test 5: lokal both + inkommande timestamp → nekas', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: 5, revision_kind: 'both' }, { source_updated_at: T2 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'incomparable_source_revision_kind' });
  });

  it('Test 6: lokal both + inkommande version → nekas', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: 5, revision_kind: 'both' }, { source_version: 6 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'incomparable_source_revision_kind' });
  });

  it('Test 7: applied revision finns men revision_kind saknas/ogiltig → ingen mutation', () => {
    for (const kind of [null, '', '   ', 'timestampish']) {
      const d = decide({ applied_source_updated_at: T1, revision_kind: kind as Kind }, { source_updated_at: T2 });
      expect(d).toEqual({ outcome: 'revision_conflict', error: 'stored_revision_kind_missing' });
    }
  });

  it('Test 7b: lagrad both utan båda värden → incomplete_composite_revision', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: null, revision_kind: 'both' }, { source_updated_at: T2, source_version: 3 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'incomplete_composite_revision' });
  });

  it('Test 8: both, timestamp nyare men version äldre → nekas', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: 10, revision_kind: 'both' }, { source_updated_at: T2, source_version: 9 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'inconsistent_composite_revision' });
  });

  it('Test 9: both, version nyare men timestamp äldre → nekas', () => {
    const d = decide({ applied_source_updated_at: T2, applied_source_version: 10, revision_kind: 'both' }, { source_updated_at: T1, source_version: 11 });
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'inconsistent_composite_revision' });
  });

  it('Test 10: both, båda samma och lokal status CANCELLED → already_cancelled', () => {
    const d = decide(
      { applied_source_updated_at: T1, applied_source_version: 10, revision_kind: 'both', applied_source_status: 'CANCELLED' },
      { source_updated_at: T1, source_version: 10 },
    );
    expect(d.outcome).toBe('already_cancelled');
  });

  it('Test 11: both, båda samma och lokal status CONFIRMED → konflikt', () => {
    const d = decide(
      { applied_source_updated_at: T1, applied_source_version: 10, revision_kind: 'both', applied_source_status: 'CONFIRMED' },
      { source_updated_at: T1, source_version: 10 },
    );
    expect(d).toEqual({ outcome: 'revision_conflict', error: 'same_revision_applied_with_active_status' });
  });

  it('Test 12: both, timestamp nyare + version samma → tillåts', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: 10, revision_kind: 'both' }, { source_updated_at: T2, source_version: 10 });
    expect(d.outcome).toBe('proceed');
  });

  it('Test 13: both, version nyare + timestamp samma → tillåts', () => {
    const d = decide({ applied_source_updated_at: T1, applied_source_version: 10, revision_kind: 'both' }, { source_updated_at: T1, source_version: 11 });
    expect(d.outcome).toBe('proceed');
  });

  it('Test 14: alla nekade beslut fattas före mutationsblocket (ingen tabell rörs)', () => {
    const denials: Decision[] = [
      decide({ applied_source_updated_at: T1, revision_kind: 'timestamp' }, { source_updated_at: T1, source_version: 2 }),
      decide({ applied_source_updated_at: T1, applied_source_version: 5, revision_kind: 'both' }, { source_updated_at: T2, source_version: 4 }),
      decide({ applied_source_updated_at: T1, revision_kind: null }, { source_updated_at: T2 }),
    ];
    for (const d of denials) {
      expect(d.outcome).not.toBe('proceed');
      expect(d.outcome).not.toBe('already_cancelled');
    }
    // SQL: samtliga RETURN med dessa fel ligger före `BEGIN`-mutationsblocket.
    const mutStart = SQL_2K.indexOf('UPDATE public.bookings');
    for (const err of [
      'incomparable_source_revision_kind',
      'stored_revision_kind_missing',
      'incomplete_composite_revision',
      'inconsistent_composite_revision',
      'same_revision_applied_with_active_status',
    ]) {
      const idx = SQL_2K.indexOf(err);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(mutStart);
    }
  });
});

describe('STEG 2K – SQL-kontrakt', () => {
  it('RPC:n jämför lagrad revision_kind mot inkommande kind', () => {
    expect(SQL_2K).toContain('v_state_kind IS DISTINCT FROM v_kind');
    expect(SQL_2K).toContain("'incomparable_source_revision_kind'");
  });

  it('ogiltig/saknad lagrad revision_kind är fail-closed', () => {
    expect(SQL_2K).toMatch(/v_state_kind NOT IN \('timestamp', 'version', 'both'\)/);
    expect(SQL_2K).toContain("'stored_revision_kind_missing'");
  });

  it('composite revision valideras på fullständighet och konsistens', () => {
    expect(SQL_2K).toContain("'incomplete_composite_revision'");
    expect(SQL_2K).toContain("'inconsistent_composite_revision'");
    expect(SQL_2K).toMatch(/v_ts_cmp > 0 AND v_ver_cmp < 0/);
    expect(SQL_2K).toMatch(/v_ts_cmp < 0 AND v_ver_cmp > 0/);
  });

  it('backfill normaliserar gamla rader utifrån faktiska kolumnvärden', () => {
    expect(SQL_2K).toContain('[2K backfill]');
    expect(SQL_2K).toMatch(/applied_source_updated_at IS NOT NULL AND applied_source_version IS NOT NULL THEN 'both'/);
    expect(SQL_2K).toMatch(/WHEN applied_source_updated_at IS NOT NULL THEN 'timestamp'/);
  });

  it('nekat resultat kan aldrig rapporteras som cancelled', () => {
    // Alla revisionsnekanden returnerar success=false med outcome != 'cancelled'.
    const conflicts = SQL_2K.match(/'outcome', 'revision_conflict'/g) ?? [];
    expect(conflicts.length).toBeGreaterThanOrEqual(5);
    expect(SQL_2K).toContain("'success', false, 'outcome', 'stale_revision'");
  });
});
