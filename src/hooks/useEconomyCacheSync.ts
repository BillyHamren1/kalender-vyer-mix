import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllEconomyDataMulti } from '@/services/planningApiService';
import { useCurrentOrg } from './useCurrentOrg';
import { bindEconomyScope, ECONOMY_CHANGED, economyBookingKey } from '@/lib/economy/cacheContract';
import { applyEconomyChanges, knownEconomyBookingIds } from '@/lib/economy/cacheUpdates';

export function useEconomyCacheSync() {
  const client = useQueryClient();
  const { organizationId: org, userId } = useCurrentOrg();
  useEffect(() => {
    if (!org || !userId) return;
    const unbind = bindEconomyScope({ organizationId: org, userId });
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const drain = async () => {
      if (running || disposed) return;
      running = true;
      while (pending.size && !disposed) {
        const ids = [...pending]; pending.clear();
        await client.cancelQueries({ queryKey: ['economy-overview', org], exact: true });
        await Promise.all(ids.map(id => client.cancelQueries({ queryKey: economyBookingKey(org, id), exact: true })));
        await client.cancelQueries({ predicate: query => query.queryKey[0] === 'large-project-booking-economy'
          && query.queryKey[1] === org && Array.isArray(query.queryKey[3]) && query.queryKey[3].some(id => ids.includes(id)) });
        try {
          const batches = await fetchAllEconomyDataMulti(ids);
          if (!disposed) applyEconomyChanges(client, org, Object.fromEntries(Object.entries(batches).filter(([id]) => !pending.has(id))));
        } catch {
          if (!disposed) {
            const failed = ids.filter(id => !pending.has(id));
            applyEconomyChanges(client, org, {}, failed);
            failed.forEach(id => client.setQueryData<boolean>(['economy-stale', org, id], true));
          }
        }
      }
      running = false;
    };
    const wake = (id: unknown) => {
      if (typeof id !== 'string' || !knownEconomyBookingIds(client, org).has(id)) return;
      pending.add(id);
      if (!timer) timer = setTimeout(() => { timer = undefined; void drain(); }, 150);
    };
    const local = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.organizationId !== org) return;
      if (detail.stale) {
        applyEconomyChanges(client, org, {}, [detail.bookingId]);
        client.setQueryData<boolean>(['economy-stale', org, detail.bookingId], true);
      }
      wake(detail.bookingId);
    };
    const channel = supabase.channel(`economy-cache:${org}:${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'economy_cache', filter: `organization_id=eq.${org}`,
    }, payload => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      // DELETE filters may not carry org: never infer the tenant from an incomplete payload.
      if (row.organization_id === org) wake(row.booking_id);
    }).subscribe();
    window.addEventListener(ECONOMY_CHANGED, local);
    return () => {
      disposed = true; unbind();
      if (timer) clearTimeout(timer);
      window.removeEventListener(ECONOMY_CHANGED, local);
      void supabase.removeChannel(channel);
    };
  }, [client, org, userId]);
}