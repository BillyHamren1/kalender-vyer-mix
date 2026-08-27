/**
 * Tenant-isolerad klientcache.
 *
 * Problem: React Query-cachen persisteras i localStorage och nycklarna är inte
 * namespacade per organisation. Loggar man in i organisation A och sedan i
 * organisation B i samma webbläsare kan A:s data hydreras in i B:s session.
 *
 * Lösning: vi spårar senast kända organisation. Så fort organisationen ändras
 * (eller blir okänd) rensas ALL persisterad och in-memory cache innan något
 * renderas från gammal tenant.
 */

export const RQ_PERSIST_KEY = 'lovable-rq-cache-v1';
const LAST_ORG_KEY = 'eventflow-active-organization-id';

/** Nycklar som får leva vidare över tenant-byte (ren UI-preferens). */
const TENANT_SAFE_PREFIXES = ['app_language', 'app_timezone', 'app_date_format', 'theme'];

const isTenantSafe = (key: string) => TENANT_SAFE_PREFIXES.some((p) => key === p || key.startsWith(p));

export const getLastKnownOrganizationId = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
};

export const setLastKnownOrganizationId = (orgId: string | null) => {
  try {
    if (orgId) window.localStorage.setItem(LAST_ORG_KEY, orgId);
    else window.localStorage.removeItem(LAST_ORG_KEY);
  } catch {
    /* ignore */
  }
};

/** Rensar persisterad React Query-cache samt tenant-specifik localStorage. */
export const clearPersistedTenantState = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RQ_PERSIST_KEY);
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (isTenantSafe(key)) continue;
      if (key.startsWith('sb-') || key === 'eventflow-planning-auth') continue; // auth hanteras av Supabase
      if (key === LAST_ORG_KEY) continue;
      doomed.push(key);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
    window.sessionStorage.removeItem('planner-cache');
  } catch (e) {
    console.warn('[TenantCacheGuard] kunde inte rensa persisterad state', e);
  }
};

/**
 * Kör vid varje känd organisation. Returnerar true om cachen rensades
 * (dvs. organisationen skiljde sig från förra kända).
 */
export const enforceTenantCacheBoundary = (
  organizationId: string | null,
  clearMemoryCache: () => void,
): boolean => {
  if (typeof window === 'undefined') return false;
  const previous = getLastKnownOrganizationId();

  if (organizationId && previous && previous !== organizationId) {
    console.warn('[TenantCacheGuard] Organisationsbyte upptäckt – rensar all cache', {
      previous,
      next: organizationId,
    });
    clearMemoryCache();
    clearPersistedTenantState();
    setLastKnownOrganizationId(organizationId);
    return true;
  }

  if (organizationId && !previous) {
    setLastKnownOrganizationId(organizationId);
  }
  return false;
};

/* -------------------------------------------------------------------------
 * Ägarskapskontroll av persisterad cache (körs synkront vid boot).
 *
 * Problemet med enbart org-vakten ovan är att den är ASYNKRON: React Query
 * hydrerar localStorage-cachen direkt vid mount, medan organisationen slås upp
 * först efter ett par nätverksanrop. Loggar användare A (org 1) ut och
 * användare B (org 2) in i samma webbläsare hinner A:s data renderas i B:s
 * session — t.ex. A:s personal i personalkalendern.
 *
 * Lösningen: vi stämplar cachen med auth-användarens id och jämför synkront
 * mot Supabase-sessionen i localStorage innan persistern skapas. Vid minsta
 * avvikelse kastas hela den persisterade cachen.
 * ---------------------------------------------------------------------- */

export const AUTH_STORAGE_KEY = 'eventflow-planning-auth';
const LAST_USER_KEY = 'eventflow-active-user-id';

/** Läser inloggad användares id synkront ur Supabase-sessionen i localStorage. */
export const readPersistedAuthUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? null;
  } catch {
    return null;
  }
};

export const getLastKnownUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
};

export const setLastKnownUserId = (userId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (userId) window.localStorage.setItem(LAST_USER_KEY, userId);
    else window.localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Kastar persisterad cache om den tillhör en annan (eller okänd) användare.
 * Returnerar true om cachen rensades.
 */
export const enforcePersistedCacheOwner = (
  currentUserId: string | null = readPersistedAuthUserId(),
): boolean => {
  if (typeof window === 'undefined') return false;
  const previous = getLastKnownUserId();

  if (!currentUserId) {
    // Ingen session → ingen persisterad tenantdata får ligga kvar.
    if (previous) {
      clearPersistedTenantState();
      setLastKnownUserId(null);
      setLastKnownOrganizationId(null);
      return true;
    }
    return false;
  }

  if (previous && previous !== currentUserId) {
    console.warn('[TenantCacheGuard] Användarbyte upptäckt – rensar persisterad cache');
    clearPersistedTenantState();
    setLastKnownOrganizationId(null);
    setLastKnownUserId(currentUserId);
    return true;
  }

  setLastKnownUserId(currentUserId);
  return false;
};
