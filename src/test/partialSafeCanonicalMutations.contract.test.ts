import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(
  resolve(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf-8',
);

/**
 * STEG 3P — canonical mutations måste vara partial-safe.
 * Ingen canonical mutation får bara console.logga fel och ändå låta
 * single-booking-importen returnera applied/already_current.
 */
describe('STEG 3P – partial-safe canonical mutations', () => {
  const requiredErrorKeys = [
    'economics_backfill_failed',
    'needs_review_reset_failed',
    'product_insert_failed',
    'product_upsert_failed',
    'product_parent_link_failed',
    'product_processing_failed',
    'package_components_read_failed',
    'package_component_insert_failed',
    'packing_item_insert_failed',
    'map_drawing_update_failed',
  ];

  for (const key of requiredErrorKeys) {
    it(`registrerar ${key} i results.errors`, () => {
      expect(src).toContain(key);
      const idx = src.indexOf(key);
      const window = src.slice(Math.max(0, idx - 400), idx + 200);
      expect(window).toContain('results.errors.push');
    });
  }

  it('expandPackageComponents returnerar strukturerat resultat med error', () => {
    expect(src).toMatch(/expandPackageComponents[\s\S]{0,200}Promise<\{ expanded: number; error\?: string \| null \}>/);
    expect(src).not.toMatch(/const (recovery|main)Expanded = await expandPackageComponents[\s\S]{0,80}Expanded > 0/);
  });

  it('revision commit sker enbart vid applied/already_current', () => {
    expect(src).toContain("outcome === 'applied' || outcome === 'already_current'");
  });
});

describe('STEG 3P – outcome-härledning', () => {
  it('deriveSingleBookingOutcome ger partial när errors finns', () => {
    const helper = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/singleBookingResult.ts'),
      'utf-8',
    );
    expect(helper).toMatch(/failed \?\? 0\) > 0 \|\| len\(results\.errors[\s\S]{0,40}return 'partial'/);
  });
});
