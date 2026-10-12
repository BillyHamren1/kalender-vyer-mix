import { supabase } from '@/integrations/supabase/client';
export interface InternalCreateAttempt { id: string; request: Record<string, unknown> }
export interface CreationIdentity { actorId: string; organizationId: string }
const key = (identity: CreationIdentity) => `internal-project-create:${identity.actorId}:${identity.organizationId}`;
export function readInternalCreateAttempt(identity: CreationIdentity, storage: Storage = localStorage): InternalCreateAttempt | null {
  const value = storage.getItem(key(identity));
  if (!value) return null;
  const attempt = JSON.parse(value) as InternalCreateAttempt;
  if (!attempt.id || attempt.request?.expected_actor_id !== identity.actorId || attempt.request?.expected_organization_id !== identity.organizationId) throw new Error('Sparat skapande hör till en annan session.');
  return attempt;
}
export async function createInternalProjectWithRetry(identity: CreationIdentity, request: Record<string, unknown>, onPending: (attempt: InternalCreateAttempt | null) => void, storage: Storage = localStorage) {
  if ((request.expected_actor_id != null && request.expected_actor_id !== identity.actorId) || (request.expected_organization_id != null && request.expected_organization_id !== identity.organizationId)) throw new Error('Den sparade förfrågan hör till en annan session.');
  const previous = readInternalCreateAttempt(identity, storage);
  const attempt = previous ?? {
    id: crypto.randomUUID(), request: {...request, expected_actor_id: identity.actorId, expected_organization_id: identity.organizationId},
  };
  // Persist BEFORE sending. A timeout, reload or closed dialog must not create a new identity.
  storage.setItem(key(identity), JSON.stringify(attempt));
  onPending(attempt);
  const {data,error} = await supabase.rpc('create_internal_project_atomic' as never, {p_id:attempt.id,p_request:attempt.request} as never) as {data: Record<string, unknown> | null;error: unknown};
  if (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    // Definite rejection of the FIRST transaction is safe to edit. A prior
    // unknown delivery remains pending until its exact receipt is recovered.
    if (!previous && ['23514','23502','23503','22P02','22007','22008','22023','42501'].includes(code)) {
      storage.removeItem(key(identity)); onPending(null);
    }
    throw error;
  }
  if (!data || data.id !== attempt.id || data.organization_id !== identity.organizationId) throw new Error('Skapandets kvitto kunde inte verifieras. Försök igen med samma förfrågan.');
  storage.removeItem(key(identity));
  return data as Record<string, unknown> & { id: string; organization_id: string };
}
