import { supabase } from '@/integrations/supabase/client';
import { getToken } from '@/services/mobileApiService';
import {
  isUuid,
  parseArticleLocationsResponse,
  type ArticleLocationsResponse,
} from '../../supabase/functions/_shared/warehouseArticleLocations';

export type ArticleLocationsFailureKind =
  | 'unauthorized' | 'permission' | 'offline' | 'not_found' | 'unavailable' | 'bad_response' | 'invalid' | 'too_large';

export class ArticleLocationsError extends Error {
  constructor(public kind: ArticleLocationsFailureKind, message: string, public code?: string) { super(message); }
}

export interface ArticleLocationsQuery {
  itemTypeId: string;
  instanceId: string | null;
  /** Expected tenant; when known, a response for another org is rejected. */
  organizationId?: string | null;
}

export type ArticleLocationsFetcher = (q: ArticleLocationsQuery, signal: AbortSignal) => Promise<ArticleLocationsResponse>;

const SCANNER_API_URL = 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/scanner-api';

export function classifyFailure(status: number, body: any): ArticleLocationsError {
  const code: string | undefined = typeof body?.code === 'string' ? body.code : body?.debugCode;
  const msg: string = typeof body?.error === 'string' ? body.error : `Fel ${status}`;
  if (status === 401) return new ArticleLocationsError('unauthorized', 'Inloggningen har gått ut. Logga in igen.', code);
  if (status === 403 || code === 'wms_forbidden' || code === 'no_organization') return new ArticleLocationsError('permission', 'Du saknar behörighet att se lagerplatser.', code);
  if (status === 404 || code === 'not_found') return new ArticleLocationsError('not_found', 'Artikeln finns inte i lagret för din organisation.', code);
  if (code === 'response_too_large') return new ArticleLocationsError('too_large', 'För många platser för att visa säkert.', code);
  if (code === 'invalid_request' || status === 400) return new ArticleLocationsError('invalid', msg, code);
  if (code === 'wms_bad_response' || code === 'organization_mismatch') return new ArticleLocationsError('bad_response', msg, code);
  return new ArticleLocationsError('unavailable', 'Lagersystemet svarar inte just nu.', code);
}

function validateClient(q: ArticleLocationsQuery, body: unknown): ArticleLocationsResponse {
  const orgId = q.organizationId ?? (body as any)?.organizationId;
  const parsed = parseArticleLocationsResponse(body, { organizationId: orgId, itemTypeId: q.itemTypeId, instanceId: q.instanceId });
  if (!parsed.ok) throw classifyFailure(parsed.status, { code: parsed.code, error: parsed.error });
  return parsed.data;
}

function assertQuery(q: ArticleLocationsQuery) {
  if (!isUuid(q.itemTypeId) || (q.instanceId !== null && !isUuid(q.instanceId))) {
    throw new ArticleLocationsError('invalid', 'Saknar giltig lagerkoppling för artikeln.');
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Operations desktop: Supabase JWT → warehouse-article-locations. */
export const fetchArticleLocationsDesktop: ArticleLocationsFetcher = async (q, signal) => {
  assertQuery(q);
  if (isOffline()) throw new ArticleLocationsError('offline', 'Ingen internetanslutning.');
  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess?.session?.access_token;
  if (!jwt) throw new ArticleLocationsError('unauthorized', 'Inloggningen har gått ut. Logga in igen.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/warehouse-article-locations`, {
      method: 'POST', signal,
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ itemTypeId: q.itemTypeId, instanceId: q.instanceId }),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ArticleLocationsError(isOffline() ? 'offline' : 'unavailable', isOffline() ? 'Ingen internetanslutning.' : 'Kunde inte nå servern.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw classifyFailure(res.status, body);
  return validateClient(q, body);
};

/**
 * Time Scan: mobile staff token → scanner-api get_article_locations.
 * Deliberately does NOT use callScannerApi: a failure here must never clear the
 * scanner session or redirect away from scan state.
 */
export const fetchArticleLocationsScanner: ArticleLocationsFetcher = async (q, signal) => {
  assertQuery(q);
  if (isOffline()) throw new ArticleLocationsError('offline', 'Ingen internetanslutning.');
  const token = getToken();
  if (!token) throw new ArticleLocationsError('unauthorized', 'Inloggningen har gått ut. Logga in igen.');
  let res: Response;
  try {
    res = await fetch(SCANNER_API_URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_article_locations', token, itemTypeId: q.itemTypeId, instanceId: q.instanceId }),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ArticleLocationsError(isOffline() ? 'offline' : 'unavailable', isOffline() ? 'Ingen internetanslutning.' : 'Kunde inte nå servern.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw classifyFailure(res.status, body);
  return validateClient(q, body);
};
