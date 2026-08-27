import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  RQ_PERSIST_KEY,
  enforcePersistedCacheOwner,
  getLastKnownUserId,
  readPersistedAuthUserId,
  setLastKnownOrganizationId,
} from '@/lib/tenant/tenantCacheGuard';

const seedSession = (userId: string) =>
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: { id: userId } }));

describe('tenant cache owner guard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('läser användar-id ur supabase-sessionen', () => {
    seedSession('user-a');
    expect(readPersistedAuthUserId()).toBe('user-a');
  });

  it('behåller cachen för samma användare', () => {
    seedSession('user-a');
    window.localStorage.setItem(RQ_PERSIST_KEY, '{"cache":"a"}');
    enforcePersistedCacheOwner();
    expect(enforcePersistedCacheOwner()).toBe(false);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBe('{"cache":"a"}');
  });

  it('kastar cachen när en annan användare loggar in', () => {
    seedSession('user-a');
    window.localStorage.setItem(RQ_PERSIST_KEY, '{"cache":"a"}');
    setLastKnownOrganizationId('org-a');
    enforcePersistedCacheOwner();

    seedSession('user-b');
    expect(enforcePersistedCacheOwner()).toBe(true);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
    expect(getLastKnownUserId()).toBe('user-b');
  });

  it('kastar cachen när ingen session finns', () => {
    seedSession('user-a');
    window.localStorage.setItem(RQ_PERSIST_KEY, '{"cache":"a"}');
    enforcePersistedCacheOwner();

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    expect(enforcePersistedCacheOwner(null)).toBe(true);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
    expect(getLastKnownUserId()).toBeNull();
  });
});
