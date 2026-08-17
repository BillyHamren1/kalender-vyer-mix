/**
 * SCANNER HARDENING – STEG 16: final release gate.
 * Låser att inget aktiveras av misstag före extern granskning.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';
import {
  RECONCILIATION_MODE,
  RECONCILIATION_REPAIR_ENABLED,
} from '@/lib/scanner/reconciliation';

const report = fs.readFileSync(
  path.resolve(__dirname, '../../docs/scanner-hardening-release-gate.md'),
  'utf8',
);

describe('STEG 16 – release gate', () => {
  it('SCANNER_TRANSACTION_V2 är OFF', () => {
    expect(SCANNER_TRANSACTION_V2).toBe(false);
  });

  it('reconciliation är read only', () => {
    expect(RECONCILIATION_MODE).toBe('read_only');
    expect(RECONCILIATION_REPAIR_ENABLED).toBe(false);
  });

  it('slutrapporten täcker alla 15 invariants', () => {
    for (let i = 1; i <= 15; i += 1) {
      expect(report).toMatch(new RegExp(`\\|\\s${i}\\s\\|`));
    }
  });

  it('slutrapporten listar blockers, flaggor, endpoints och legacy paths', () => {
    for (const section of ['Blockers', 'Feature flags', 'Endpoints', 'legacy paths', 'Migrationsfiler']) {
      expect(report.toLowerCase()).toContain(section.toLowerCase());
    }
  });

  it('rapporten deklarerar att ingen aktivering skett', () => {
    expect(report).toContain('DO NOT ACTIVATE');
    expect(report).toContain('Ingen produktionsdeploy');
  });
});
