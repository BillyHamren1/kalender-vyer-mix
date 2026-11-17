import { describe, it, expect } from 'vitest';
import { baseUsername, insertWithUniqueUsername } from '@/lib/staff/staffUsername';

describe('staff username', () => {
  it('is built from the name, never the email', () => {
    expect(baseUsername('Billy Hamrén')).toBe('billy.hamren');
  });
  it('picks the next free name when taken in any organisation', async () => {
    const taken = new Set(['anna.berg', 'anna.berg2']);
    const u = await insertWithUniqueUsername('Anna Berg', async (n) =>
      taken.has(n) ? { error: { code: '23505', message: 'duplicate key staff_accounts_username_key' } } : { error: null });
    expect(u).toBe('anna.berg3');
  });
  it('does not swallow other errors', async () => {
    await expect(insertWithUniqueUsername('A B', async () => ({ error: { code: '42501', message: 'denied' } }))).rejects.toThrow('denied');
  });
});
