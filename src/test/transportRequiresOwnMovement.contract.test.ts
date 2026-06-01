/**
 * Architecture contract — locks Core memory:
 *   mem://constraints/transport-requires-own-movement-v1
 *   mem://constraints/night-auto-start-guard-v1
 *
 * Reads buildTransportFromLocationTruth.ts as text and fails if the file
 * loses the hard gate that gates "Resa"-creation on:
 *   - staffOwnDisplacement evidence
 *   - MAX_TRANSPORT_GAP_MIN
 *   - private_residence rejection
 *   - night-window rejection
 *
 * The actual semantic behaviour is asserted in the Deno guard tests next
 * to the file; this contract test prevents the gate from being silently
 * removed in a future refactor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(
  process.cwd(),
  'supabase/functions/_shared/time-engine/buildTransportFromLocationTruth.ts',
);
const src = readFileSync(FILE, 'utf8');

describe('buildTransportFromLocationTruth — transport requires own movement', () => {
  it('imports staffOwnDisplacementMeters from the displacement helper', () => {
    expect(src).toMatch(/from\s+['"]\.\/staffOwnDisplacement\.ts['"]/);
    expect(src).toMatch(/staffOwnDisplacementMeters/);
  });

  it('declares MAX_TRANSPORT_GAP_MIN constant capped at 30 minutes', () => {
    const m = src.match(/MAX_TRANSPORT_GAP_MIN\s*=\s*(\d+)/);
    expect(m, 'MAX_TRANSPORT_GAP_MIN must be declared').toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(30);
  });

  it('rejects transport from private_residence (no auto Resa hemifrån)', () => {
    expect(src).toMatch(/rejected_from_private_residence/);
    expect(src).toMatch(/private_residence/);
  });

  it('rejects transport that overlaps the 00–05 night window', () => {
    expect(src).toMatch(/rejected_night_window/);
    expect(src).toMatch(/NIGHT_GUARD_START_HOUR/);
    expect(src).toMatch(/NIGHT_GUARD_END_HOUR/);
  });

  it('rejects transport when staff own displacement < TRANSPORT_MIN_DISTANCE_METERS', () => {
    expect(src).toMatch(/rejected_no_own_movement/);
    // The gate must compare against the threshold constant, not a random number.
    expect(src).toMatch(/ownDisplacement[\s\S]{0,80}TRANSPORT_MIN_DISTANCE_METERS/);
  });

  it('rejects transport when anchor pings are missing on either side', () => {
    expect(src).toMatch(/rejected_missing_anchor_pings/);
  });

  it('exposes staffOwnDisplacementMeters in supportEvidence on created transports', () => {
    expect(src).toMatch(/staffOwnDisplacementMeters:\s*Math\.round\(ownDisplacement\)/);
  });
});
