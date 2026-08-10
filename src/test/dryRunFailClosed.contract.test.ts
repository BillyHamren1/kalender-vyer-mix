import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveDryRun } from '../../supabase/functions/_shared/syncObservability.ts';

const INDEX = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');

describe('STEG 3J — dry-run fail-closed', () => {
  it('dry_run:true utan booking_id → invalid, aldrig live', () => {
    const r = resolveDryRun({ dry_run: true });
    expect(r.dryRun).toBe(false);
    expect(r.requested).toBe(true);
    expect(r.invalid).toBe(true);
    expect(r.reason).toBe('dry_run_requires_single_booking_id');
  });

  it('dry_run:true med tom booking_id → invalid', () => {
    const r = resolveDryRun({ dry_run: true, booking_id: '   ' });
    expect(r.invalid).toBe(true);
    expect(r.dryRun).toBe(false);
  });

  it('dry_run:true med array/multi booking → invalid', () => {
    expect(resolveDryRun({ dry_run: true, booking_id: ['a', 'b'] }).invalid).toBe(true);
    expect(resolveDryRun({ dry_run: true, booking_id: 'a', booking_ids: ['a', 'b'] }).invalid).toBe(true);
    expect(resolveDryRun({ dry_run: true, booking_id: 'a', only_booking_ids: ['a'] }).invalid).toBe(true);
  });

  it('dry_run:true med ogiltig organization_id → invalid', () => {
    expect(resolveDryRun({ dry_run: true, booking_id: 'a', organization_id: '' }).invalid).toBe(true);
    expect(resolveDryRun({ dry_run: true, booking_id: 'a', organization_id: 123 }).invalid).toBe(true);
    expect(resolveDryRun({ dry_run: true, booking_id: 'a', organization_id: 'org-1' }).dryRun).toBe(true);
  });

  it('giltig dry-run → dryRun true, inte invalid', () => {
    const r = resolveDryRun({ dry_run: true, booking_id: '2606-24' });
    expect(r).toEqual({ dryRun: true, requested: true, invalid: false });
  });

  it('dry_run:false och saknat dry_run → normal live-väg', () => {
    expect(resolveDryRun({ dry_run: false, booking_id: 'a' })).toEqual({ dryRun: false, requested: false, invalid: false });
    expect(resolveDryRun({ booking_id: 'a' }).requested).toBe(false);
    expect(resolveDryRun(null).requested).toBe(false);
    expect(resolveDryRun({ dry_run: 'true' }).requested).toBe(false);
  });

  it('import-bookings avbryter requesten vid ogiltig dry-run (400 + invalid_dry_run_request)', () => {
    expect(INDEX).toContain('dryRunResolution.requested && !dryRunResolution.dryRun');
    expect(INDEX).toContain("outcome: 'invalid_dry_run_request'");
    expect(INDEX).toContain('status: 400');
    // Får inte längre finnas någon "ignorera och fortsätt live"-väg.
    expect(INDEX).not.toContain('dry_run ignored');
  });

  it('fail-closed-returen ligger före cursor/lease/sync-faser', () => {
    const guardIdx = INDEX.indexOf("outcome: 'invalid_dry_run_request'");
    const cursorIdx = INDEX.indexOf('cursor read');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(cursorIdx).toBeGreaterThan(guardIdx);
  });
});
