import { describe, it, expect } from 'vitest';
import { normalizePreviewBundle, previewSectionToCsv } from '@/features/time-v2/lib/contract';

const raw = {
  preview: {
    submission_id: 'sub-1',
    revision: 3,
    snapshot_version: 'snap-abc',
    is_test_fixture: true,
    payroll: {
      attested: true,
      generated_at: '2026-09-02T12:00:00Z',
      total_minutes: 485,
      total_amount: 2450,
      currency: 'SEK',
      lines: [
        { line_id: 'p1', label: 'Arbete', target_id: 'proj-1', minutes: 410, amount: 2050, note: 'ordinarie' },
        { line_id: 'p2', label: 'Resa', minutes: 45, amount: 400 },
      ],
    },
    project: {
      attested: false,
      blocked_reason: 'Projektdomänen är inte attesterad i Time.',
      lines: [],
    },
  },
};

describe('Time V2 payroll/project preview contract', () => {
  it('normalizes exactly what Time reports and marks preview-only', () => {
    const b = normalizePreviewBundle(raw)!;
    expect(b.previewOnly).toBe(true);
    expect(b.revision).toBe(3);
    expect(b.isTestFixture).toBe(true);
    expect(b.payroll.attested).toBe(true);
    expect(b.payroll.lines).toHaveLength(2);
    expect(b.payroll.totalAmount).toBe(2450);
    expect(b.project.attested).toBe(false);
    expect(b.project.blockedReason).toContain('inte attesterad');
  });

  it('never invents amounts when Time reports none', () => {
    const b = normalizePreviewBundle({
      submission_id: 's2',
      payroll: { attested: true, lines: [{ line_id: 'x', label: 'Arbete', minutes: 60 }] },
    })!;
    expect(b.payroll.amountsAvailable).toBe(false);
    expect(b.payroll.totalAmount).toBeNull();
    expect(b.payroll.lines[0].amount).toBeNull();
    expect(b.payroll.totalMinutes).toBe(60);
  });

  it('rejects payloads without a submission id', () => {
    expect(normalizePreviewBundle({ payroll: {} })).toBeNull();
  });

  it('exports deterministic preview-labelled CSV', () => {
    const b = normalizePreviewBundle(raw)!;
    const csv = previewSectionToCsv(b.payroll, b);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('preview_only');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('TRUE;sub-1;3;snap-abc;payroll;p1;Arbete;proj-1;410;2050;SEK;ordinarie');
    expect(previewSectionToCsv(b.payroll, b)).toBe(csv);
  });
});
