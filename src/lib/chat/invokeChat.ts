import { supabase } from '@/integrations/supabase/client';

/**
 * Single, shared transport for every chat-related call from the web admin
 * surfaces (DM service, jobChat service, etc.).
 *
 * Why a dedicated helper:
 *   - One place to apply consistent error normalization
 *     (Supabase invoke errors, edge-function `{ error }` payloads, network errors).
 *   - One log prefix for grep-able server traces.
 *   - Mobile uses `mobileApiService.callApi` (token-in-body, XHR-friendly).
 *     Web uses Supabase JS, which forwards the active session JWT.
 *     Both routes hit the same `mobile-app-api` edge function.
 */
export async function invokeChat<T = any>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const { data: result, error } = await supabase.functions.invoke('mobile-app-api', {
    body: { action, data },
  });

  if (error) {
    console.error(`[chat-api] ${action} failed:`, error);
    // Supabase wraps non-2xx as FunctionsHttpError — surface the underlying message.
    throw new Error(error.message || `Anropet "${action}" misslyckades`);
  }

  if (result && typeof result === 'object' && 'error' in result && result.error) {
    console.error(`[chat-api] ${action} returned error:`, result.error);
    throw new Error(String(result.error));
  }

  return result as T;
}
