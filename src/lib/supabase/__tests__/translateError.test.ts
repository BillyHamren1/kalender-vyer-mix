import { describe, it, expect } from 'vitest';
import { translateSupabaseError } from '../translateError';

describe('translateSupabaseError', () => {
  it('översätter PGRST116 till svensk text', () => {
    const out = translateSupabaseError({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });
    expect(out).toMatch(/Hittade inte rätt rad/);
    expect(out).not.toMatch(/JSON object requested/);
  });

  it('matchar även på meddelandetext utan kod', () => {
    const out = translateSupabaseError({
      message: 'JSON object requested, multiple (or no) rows returned',
    });
    expect(out).toMatch(/Hittade inte rätt rad/);
  });

  it('översätter unique violation 23505', () => {
    expect(translateSupabaseError({ code: '23505', message: 'dup' })).toMatch(/dubblett/);
  });

  it('översätter foreign key violation 23503', () => {
    expect(translateSupabaseError({ code: '23503', message: 'fk' })).toMatch(/koppling/);
  });

  it('faller tillbaka på meddelandet annars', () => {
    expect(translateSupabaseError({ message: 'något annat' })).toBe('något annat');
  });

  it('faller tillbaka på fallback om inget', () => {
    expect(translateSupabaseError(null, 'fb')).toBe('fb');
  });
});
