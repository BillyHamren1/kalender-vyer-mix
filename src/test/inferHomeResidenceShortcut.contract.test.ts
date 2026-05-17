/**
 * Contract test — Boende (private_residence) polygons ALWAYS win as home.
 *
 * Reglerna som låses här:
 *  1. infer-home-location laddar geofence_polygon från
 *     organization_locations där is_private_residence=true.
 *  2. För varje observation görs point-in-polygon-check; träff → upsert
 *     primary direkt med cluster_key='residence:<location_id>' och
 *     confidence=1, oavsett 2-natters-regeln.
 *  3. Response innehåller residence_homes_upserted + residences_loaded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');

describe('infer-home-location: Boende-polygoner vinner som hem', () => {
  const src = readFileSync(
    resolve(repoRoot, 'supabase/functions/infer-home-location/index.ts'),
    'utf8',
  );

  it('importerar pointInPolygon från shared geofenceEval', () => {
    expect(src).toMatch(/from\s+['"]\.\.\/_shared\/geofenceEval\.ts['"]/);
    expect(src).toMatch(/pointInPolygon/);
  });

  it('laddar geofence_polygon + is_private_residence från organization_locations', () => {
    expect(src).toMatch(/is_private_residence/);
    expect(src).toMatch(/geofence_polygon/);
  });

  it('definierar findResidenceForPoint som org-scopad point-in-polygon', () => {
    expect(src).toMatch(/findResidenceForPoint\s*\(/);
    expect(src).toMatch(/if \(r\.org !== org\) continue;[\s\S]{0,80}pointInPolygon/);
  });

  it('upsertar primary hem med cluster_key residence:<location_id> + confidence 1', () => {
    expect(src).toMatch(/cluster_key:\s*`residence:\$\{r\.location_id\}`/);
    expect(src).toMatch(/kind:\s*['"]primary['"]/);
    expect(src).toMatch(/confidence:\s*1\b/);
  });

  it('kortsluter staff-loopen med continue (hoppar över 2-natters-regeln)', () => {
    const shortcutIdx = src.indexOf('SHORTCUT: "Boende"-polygoner');
    expect(shortcutIdx).toBeGreaterThan(0);
    const block = src.slice(shortcutIdx, shortcutIdx + 2500);
    expect(block).toMatch(/continue;/);
  });

  it('exponerar residence_homes_upserted + residences_loaded i svaret', () => {
    expect(src).toMatch(/residence_homes_upserted/);
    expect(src).toMatch(/residences_loaded/);
  });

  it('private_residence-polygoner exkluderas från workExclusions', () => {
    // workExclusions-filtret måste hoppa över private_residence så att
    // Boende-polygoner inte både blockerar OCH vinner.
    expect(src).toMatch(/location_type\s*\?\?\s*''\)\s*!==\s*['"]private_residence['"]/);
    expect(src).toMatch(/is_private_residence\s*!==\s*true/);
  });
});
