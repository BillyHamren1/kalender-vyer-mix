import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Mirror-kontrakt: get-mobile-staff-day-report MÅSTE använda
 * buildNeedsReviewFallbackBlocks när display_blocks_json är tom men
 * report_candidate_blocks_json har innehåll. Detta skyddar mot regression
 * där V2-tom-policyn råkar släppa igenom en helt tom mobil-tidslinje trots
 * att kandidater finns att granska.
 */
describe('mobile day-report fallback contract', () => {
  const root = path.resolve(__dirname, '..', '..');
  const helperPath = path.join(
    root,
    'supabase/functions/_shared/mobile/buildNeedsReviewFallbackBlocks.ts',
  );
  const mirrorPath = path.join(
    root,
    'supabase/functions/get-mobile-staff-day-report/index.ts',
  );

  it('helper-filen finns', () => {
    expect(fs.existsSync(helperPath)).toBe(true);
  });

  it('mirror importerar helpern', () => {
    const src = fs.readFileSync(mirrorPath, 'utf8');
    expect(src).toMatch(/buildNeedsReviewFallbackBlocks/);
    expect(src).toMatch(/from\s+["']\.\.\/_shared\/mobile\/buildNeedsReviewFallbackBlocks\.ts["']/);
  });

  it('mirror beslutar fallback baserat på V2-tom + kandidater', () => {
    const src = fs.readFileSync(mirrorPath, 'utf8');
    // V2-array måste vara tom
    expect(src).toMatch(/display_blocks_json\s*\)\s*&&[\s\S]{0,80}length\s*===\s*0/);
    // report_candidate_blocks_json måste ha längd > 0
    expect(src).toMatch(/report_candidate_blocks_json[\s\S]{0,100}length\s*>\s*0/);
  });

  it('mirror exponerar mirrorFallback i debug', () => {
    const src = fs.readFileSync(mirrorPath, 'utf8');
    expect(src).toMatch(/mirrorFallback/);
    expect(src).toMatch(/v2_empty_with_candidates/);
  });

  it('helpern markerar block som needs_review + provisional', () => {
    const src = fs.readFileSync(helperPath, 'utf8');
    expect(src).toMatch(/kind:\s*["']needs_review["']/);
    expect(src).toMatch(/reviewState:\s*["']needs_review["']/);
    expect(src).toMatch(/_provisionalFromCandidates:\s*true/);
  });

  it('helpern droppar signal_gap och liknande raw-debug-kinds', () => {
    const src = fs.readFileSync(helperPath, 'utf8');
    expect(src).toMatch(/DROP_KINDS[\s\S]{0,200}signal_gap/);
  });
});
