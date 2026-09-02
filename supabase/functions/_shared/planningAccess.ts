/**
 * Planning-behörighet för edge-funktioner som använder service role efter JWT-verifiering.
 *
 * JWT räcker INTE ensam: en verifierad användare kan sakna Planning-behörighet.
 * Vi använder projektets etablerade kontroll public.has_planning_access(_user_id)
 * och kräver dessutom att användaren är kopplad till en organisation.
 */

export interface PlanningAccessDenied {
  status: 401 | 403;
  error: string;
  message: string;
}

export interface PlanningAccessGranted {
  organizationId: string;
}

export type PlanningAccessResult =
  | ({ ok: true } & PlanningAccessGranted)
  | ({ ok: false } & PlanningAccessDenied);

export const NO_ORGANIZATION_DENIAL: PlanningAccessDenied = {
  status: 403,
  error: 'no_organization',
  message: 'Ingen organisation kopplad till användaren',
};

export const NO_PLANNING_ACCESS_DENIAL: PlanningAccessDenied = {
  status: 403,
  error: 'planning_access_required',
  message: 'Kontot saknar Planning-behörighet.',
};

/** Ren beslutsfunktion — testbar utan nätverk/DB. */
export const decidePlanningAccess = (input: {
  organizationId?: string | null;
  hasPlanningAccess?: boolean | null;
}): PlanningAccessResult => {
  if (input.hasPlanningAccess !== true) {
    return { ok: false, ...NO_PLANNING_ACCESS_DENIAL };
  }
  if (!input.organizationId) {
    return { ok: false, ...NO_ORGANIZATION_DENIAL };
  }
  return { ok: true, organizationId: input.organizationId };
};

/**
 * Kör behörighetssteget mot databasen med service-role-klienten.
 * Ska anropas EFTER auth.getUser och FÖRE all annan service-role-läsning/skrivning.
 */
export const assertPlanningAccess = async (
  serviceClient: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    from: (table: string) => any;
  },
  userId: string,
): Promise<PlanningAccessResult> => {
  const { data: allowed, error: rpcError } = await serviceClient.rpc('has_planning_access', {
    _user_id: userId,
  });
  if (rpcError) {
    console.error('[planningAccess] has_planning_access failed', rpcError);
    return { ok: false, ...NO_PLANNING_ACCESS_DENIAL };
  }
  if (allowed !== true) return { ok: false, ...NO_PLANNING_ACCESS_DENIAL };

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  return decidePlanningAccess({
    organizationId: (profile as { organization_id?: string | null } | null)?.organization_id ?? null,
    hasPlanningAccess: true,
  });
};
