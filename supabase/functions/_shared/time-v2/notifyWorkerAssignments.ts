/**
 * Intern Planning→Time-notis från en Edge Function.
 *
 * Anropar den befintliga gränsen `time-planning-proxy` med operationen
 * `worker.assignments.push`. Proxyn äger signering, organisationsscope och
 * projektionen — här skickas bara vilka bokningar/personer som berörts.
 *
 * Fire-and-forget: fel loggas men får aldrig fälla importen.
 */

export const INTERNAL_PUSH_HEADER = 'x-planning-internal-key';

export interface InternalWorkerPushInput {
  readonly organizationId: string;
  readonly bookingIds?: readonly string[];
  readonly staffIds?: readonly string[];
  readonly reason: string;
}

export async function notifyTimeWorkerAssignments(input: InternalWorkerPushInput): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const bookingIds = [...new Set((input.bookingIds ?? []).filter((id) => typeof id === 'string' && id.trim()))];
  const staffIds = [...new Set((input.staffIds ?? []).filter((id) => typeof id === 'string' && id.trim()))];
  if (!supabaseUrl || !serviceKey || !input.organizationId) return;
  if (!bookingIds.length && !staffIds.length) return;

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/time-planning-proxy`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        [INTERNAL_PUSH_HEADER]: serviceKey,
      },
      body: JSON.stringify({
        operation: 'worker.assignments.push',
        organizationId: input.organizationId,
        reason: input.reason,
        ...(bookingIds.length ? { bookingIds } : {}),
        ...(staffIds.length ? { staffIds } : {}),
      }),
    });
    if (!response.ok) {
      console.warn('[time-worker-push] non-fatal upstream status', response.status);
    }
    await response.body?.cancel();
  } catch (error) {
    console.warn('[time-worker-push] non-fatal failure', (error as Error)?.message ?? 'okänt fel');
  }
}
