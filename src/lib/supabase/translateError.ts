/**
 * Översätter Supabase/PostgREST-fel till svensk användartext.
 * Behåller alltid den råa koden i konsolen via console.error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function translateSupabaseError(err: any, fallback = 'Något gick fel'): string {
  if (!err) return fallback;
  const code = err.code || err?.error?.code;
  const raw = err.message || err?.error?.message || '';

  if (code === 'PGRST116' || /multiple \(or no\) rows returned/i.test(raw)) {
    return 'Hittade inte rätt rad i databasen (förväntade exakt en träff). Kontakta admin om det upprepas.';
  }
  if (code === 'PGRST301') {
    return 'Behörighet saknas för operationen.';
  }
  if (code === '23505') {
    return 'Posten finns redan (dubblettkonflikt).';
  }
  if (code === '23503') {
    return 'Kan inte spara — en koppling till annan post saknas.';
  }
  return raw || fallback;
}
