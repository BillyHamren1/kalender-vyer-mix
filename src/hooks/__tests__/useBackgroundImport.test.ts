import { describe, expect, it } from 'vitest';
import { isBackgroundImportRoute } from '../useBackgroundImport';

describe('isBackgroundImportRoute', () => {
  it('allows dashboard-like routes only', () => {
    expect(isBackgroundImportRoute('/dashboard')).toBe(true);
    expect(isBackgroundImportRoute('/calendar')).toBe(true);
    expect(isBackgroundImportRoute('/booking-list')).toBe(true);
  });

  it('blocks projects routes so project navigation does not trigger background import', () => {
    expect(isBackgroundImportRoute('/projects')).toBe(false);
    expect(isBackgroundImportRoute('/project/123')).toBe(false);
    expect(isBackgroundImportRoute('/large-project/123')).toBe(false);
    expect(isBackgroundImportRoute('/my-projects')).toBe(false);
  });
});