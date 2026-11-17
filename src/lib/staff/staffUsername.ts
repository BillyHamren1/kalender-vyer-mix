// Usernames are the login identity and must be unique across ALL organisations
// (DB unique index staff_accounts_username_key). Never derived from email, because
// one person can be a member of several organisations.

export function baseUsername(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
  return base || 'personal';
}

/** Candidate usernames in order: "anna.berg", "anna.berg2", "anna.berg3" ... */
export function usernameCandidate(name: string, attempt: number): string {
  const base = baseUsername(name);
  return attempt <= 1 ? base : `${base}${attempt}`;
}

type InsertFn = (username: string) => Promise<{ error: { code?: string; message: string } | null }>;

/**
 * Tries candidates until the insert succeeds. A unique violation (23505) means the
 * name is taken somewhere (possibly another organisation we cannot read) → next candidate.
 */
export async function insertWithUniqueUsername(name: string, insert: InsertFn, maxAttempts = 50): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const username = usernameCandidate(name, attempt);
    const { error } = await insert(username);
    if (!error) return username;
    if (error.code !== '23505' || !/username/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error('Kunde inte hitta ett ledigt användarnamn');
}
