/**
 * Read-only Time V2 contract client.
 *
 * GET only. No mutation of Time or Planning source records is possible here.
 * The base URL comes from configuration (VITE_TIME_V2_BASE_URL). When it is
 * missing the client fails truthfully ("not configured") instead of guessing
 * or fabricating rows.
 */

import {
  buildTimeV2Url,
  normalizeOverview,
  TIME_V2_CONTRACT_VERSION,
  type TimeV2EndpointKey,
  type TimeV2Overview,
} from './contract';

export type TimeV2ClientErrorKind =
  | 'not_configured'
  | 'unreachable'
  | 'http_error'
  | 'bad_payload';

export class TimeV2ClientError extends Error {
  kind: TimeV2ClientErrorKind;
  status?: number;
  constructor(kind: TimeV2ClientErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'TimeV2ClientError';
    this.kind = kind;
    this.status = status;
  }
}

export function getTimeV2BaseUrl(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): string | null {
  const raw = env.VITE_TIME_V2_BASE_URL;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export interface TimeV2ClientOptions {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function readEndpoint(
  key: TimeV2EndpointKey,
  params: Record<string, string | undefined>,
  opts: TimeV2ClientOptions,
): Promise<unknown> {
  const baseUrl = opts.baseUrl ?? getTimeV2BaseUrl();
  if (!baseUrl) {
    throw new TimeV2ClientError(
      'not_configured',
      'Time-källan är inte konfigurerad (VITE_TIME_V2_BASE_URL saknas).',
    );
  }
  const url = buildTimeV2Url(baseUrl, key, params);
  const doFetch = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-EventFlow-Contract-Version': TIME_V2_CONTRACT_VERSION,
        'X-EventFlow-Consumer': 'planning-time-v2',
      },
      signal: opts.signal,
    });
  } catch (e) {
    throw new TimeV2ClientError('unreachable', `Time-källan gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`);
  }

  if (!res.ok) {
    throw new TimeV2ClientError('http_error', `Time-källan svarade ${res.status}.`, res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ogiltig JSON.');
  }
}

/** Landing overview: source status + personnel + review queue + attestability. */
export async function fetchTimeV2Overview(
  organizationId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2Overview> {
  const raw = await readEndpoint('sourceStatus', { organization_id: organizationId }, opts);
  return normalizeOverview(raw);
}

export { TIME_V2_CONTRACT_VERSION };
