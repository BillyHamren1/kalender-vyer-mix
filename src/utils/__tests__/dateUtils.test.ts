/**
 * ============================================================
 * TEST: Date Utilities — ISO conversion, UTC extraction
 * ============================================================
 * Critical for all planner time/date operations.
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest';
import {
  convertToISO8601,
  extractUTCTime,
  extractUTCDate,
  buildUTCDateTime,
} from '@/utils/dateUtils';

// ─── convertToISO8601 ──────────────────────────────────────

describe('convertToISO8601', () => {
  it('converts Supabase format to ISO', () => {
    expect(convertToISO8601('2025-06-10 14:00:00+00')).toBe('2025-06-10T14:00:00Z');
  });

  it('passes through ISO format with Z', () => {
    const iso = '2025-06-10T14:00:00Z';
    expect(convertToISO8601(iso)).toBe(iso);
  });

  it('passes through ISO format with timezone offset', () => {
    const iso = '2025-06-10T14:00:00+02:00';
    expect(convertToISO8601(iso)).toBe(iso);
  });

  it('passes through ISO with milliseconds', () => {
    const iso = '2025-06-10T14:00:00.000Z';
    expect(convertToISO8601(iso)).toBe(iso);
  });

  it('handles midnight correctly', () => {
    expect(convertToISO8601('2025-06-10 00:00:00+00')).toBe('2025-06-10T00:00:00Z');
  });

  it('handles end of day correctly', () => {
    expect(convertToISO8601('2025-06-10 23:59:59+00')).toBe('2025-06-10T23:59:59Z');
  });

  it('returns fallback for null', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = convertToISO8601(null);
    expect(new Date(result).getTime()).not.toBeNaN();
    spy.mockRestore();
  });

  it('returns fallback for undefined', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = convertToISO8601(undefined);
    expect(new Date(result).getTime()).not.toBeNaN();
    spy.mockRestore();
  });

  it('returns fallback for empty string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = convertToISO8601('');
    expect(new Date(result).getTime()).not.toBeNaN();
    spy.mockRestore();
  });

  it('returns fallback for garbage input', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = convertToISO8601('not-a-date');
    expect(new Date(result).getTime()).not.toBeNaN();
    spy.mockRestore();
  });
});

// ─── extractUTCTime ────────────────────────────────────────

describe('extractUTCTime', () => {
  it('extracts HH:mm from ISO string', () => {
    expect(extractUTCTime('2025-06-10T14:30:00Z')).toBe('14:30');
  });

  it('extracts HH:mm from ISO with milliseconds', () => {
    expect(extractUTCTime('2025-06-10T08:05:00.000Z')).toBe('08:05');
  });

  it('handles midnight', () => {
    expect(extractUTCTime('2025-06-10T00:00:00Z')).toBe('00:00');
  });

  it('handles Date object', () => {
    const d = new Date('2025-06-10T14:30:00Z');
    expect(extractUTCTime(d)).toBe('14:30');
  });

  it('returns 00:00 for malformed input', () => {
    expect(extractUTCTime('no-T-separator')).toBe('00:00');
  });
});

// ─── extractUTCDate ────────────────────────────────────────

describe('extractUTCDate', () => {
  it('extracts YYYY-MM-DD from ISO string', () => {
    expect(extractUTCDate('2025-06-10T14:30:00Z')).toBe('2025-06-10');
  });

  it('handles Date object', () => {
    const d = new Date('2025-12-25T00:00:00Z');
    expect(extractUTCDate(d)).toBe('2025-12-25');
  });

  it('handles ISO with milliseconds', () => {
    expect(extractUTCDate('2025-01-01T08:00:00.000Z')).toBe('2025-01-01');
  });
});

// ─── buildUTCDateTime ──────────────────────────────────────

describe('buildUTCDateTime', () => {
  it('builds correct ISO string', () => {
    const result = buildUTCDateTime('2025-06-15', '14:30');
    expect(result).toBe('2025-06-15T14:30:00.000Z');
  });

  it('handles midnight', () => {
    const result = buildUTCDateTime('2025-06-15', '00:00');
    expect(result).toBe('2025-06-15T00:00:00.000Z');
  });

  it('handles end of day', () => {
    const result = buildUTCDateTime('2025-06-15', '23:59');
    expect(result).toBe('2025-06-15T23:59:00.000Z');
  });

  it('round-trips with extractUTCTime and extractUTCDate', () => {
    const original = buildUTCDateTime('2025-06-15', '14:30');
    expect(extractUTCDate(original)).toBe('2025-06-15');
    expect(extractUTCTime(original)).toBe('14:30');
  });
});
