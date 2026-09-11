/**
 * Unika realtidskanalnamn.
 *
 * Supabase Realtime kastar "tried to subscribe multiple times" om två
 * instanser i samma flik använder samma kanalnamn. Ett sådant kast under
 * mount slår ut hela sidan via GlobalErrorBoundary. Alla kanaler ska därför
 * ha ett namn som är unikt per tenant OCH per instans.
 */

let counter = 0;

export function uniqueChannelName(base: string, scope?: string | null): string {
  counter += 1;
  const suffix = `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
  return scope ? `${base}-${scope}-${suffix}` : `${base}-${suffix}`;
}
