import { describe, expect, it, vi } from 'vitest';
import {
  ARTICLE_LOCATIONS_LIMITS,
  buildArticleLocationsRequest,
  deriveArticleStatus,
  fetchArticleLocations,
  parseArticleLocationsResponse,
} from '../../supabase/functions/_shared/warehouseArticleLocations';
import { hmacSha256Hex } from '../../supabase/functions/_shared/timeWmsProjection';
import { articleFixture, ORG, ITEM, INSTANCE } from './fixtures/articleLocationsFixture';

const actor = { organizationId: ORG, personnelId: 'staff-1', label: 'Anna' };

describe('warehouse-article-locations.v1 request', () => {
  it('builds exact body and signs timestamp.nonce.rawBody with HMAC', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(articleFixture()), { status: 200 }));
    const req = buildArticleLocationsRequest({ deviceId: 'dev', actor, itemTypeId: ITEM });
    const res = await fetchArticleLocations(req, {
      hmacSecret: 's3cret', fetchImpl: fetchImpl as any,
      now: () => new Date('2026-10-08T12:00:00.000Z'), nonce: () => 'abc',
    });
    expect(res.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toMatch(/time-wms-outbound\/outbound\/article-locations$/);
    expect(url).not.toMatch(/[?&](key|token|secret)/i);
    expect(JSON.parse(init.body)).toEqual({
      schema: 'warehouse-article-locations-request.v1', deviceId: 'dev', actor, itemTypeId: ITEM,
    });
    expect(init.headers['x-time-signature']).toBe(
      await hmacSha256Hex('s3cret', `2026-10-08T12:00:00.000Z.abc.${init.body}`),
    );
    expect(init.headers.authorization).toBeUndefined();
  });

  it('fails closed without secret or with non-uuid ids', async () => {
    const fetchImpl = vi.fn();
    expect((await fetchArticleLocations(buildArticleLocationsRequest({ deviceId: 'd', actor, itemTypeId: ITEM }), { hmacSecret: '', fetchImpl })).ok).toBe(false);
    const bad = await fetchArticleLocations(buildArticleLocationsRequest({ deviceId: 'd', actor, itemTypeId: 'Tält 3x3' }), { hmacSecret: 'x', fetchImpl });
    expect(bad).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps upstream statuses to stable distinct codes', async () => {
    const run = async (status: number) => (await fetchArticleLocations(
      buildArticleLocationsRequest({ deviceId: 'd', actor, itemTypeId: ITEM }),
      { hmacSecret: 'x', fetchImpl: (async () => new Response('{"code":"nope"}', { status })) as any },
    ));
    expect(await run(403)).toMatchObject({ code: 'wms_forbidden', status: 403 });
    expect(await run(404)).toMatchObject({ code: 'not_found', status: 404 });
    expect(await run(500)).toMatchObject({ code: 'wms_unavailable' });
    const net = await fetchArticleLocations(buildArticleLocationsRequest({ deviceId: 'd', actor, itemTypeId: ITEM }),
      { hmacSecret: 'x', fetchImpl: (async () => { throw new TypeError('x'); }) as any });
    expect(net).toMatchObject({ code: 'wms_unavailable' });
  });
});

describe('warehouse-article-locations.v1 response validation', () => {
  const expected = { organizationId: ORG, itemTypeId: ITEM, instanceId: null };

  it('accepts two exact placements on different floors across two maps', () => {
    const r = parseArticleLocationsResponse(articleFixture(), expected);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.placements.map((p) => p.slot?.level)).toEqual([1, 3]);
      expect(r.data.maps).toHaveLength(2);
    }
  });

  it('rejects a response for another organization', () => {
    const r = parseArticleLocationsResponse({ ...articleFixture(), organizationId: 'other' }, expected);
    expect(r).toMatchObject({ ok: false, code: 'organization_mismatch' });
  });

  it('rejects article-level placements when an instance was requested', () => {
    const body = articleFixture({ instanceId: INSTANCE });
    body.placements[1].instanceId = null;
    const r = parseArticleLocationsResponse(body, { ...expected, instanceId: INSTANCE });
    expect(r.ok).toBe(false);
  });

  it('enforces status rule (PLACED / UNKNOWN / UNPLACED)', () => {
    expect(deriveArticleStatus([{ state: 'SLOT_MISSING' }, { state: 'EXACT' }])).toBe('PLACED');
    expect(deriveArticleStatus([{ state: 'SLOT_MISSING' }, { state: 'PALLET_UNPLACED' }])).toBe('UNKNOWN');
    expect(deriveArticleStatus([{ state: 'PALLET_UNPLACED' }])).toBe('UNPLACED');
    expect(deriveArticleStatus([])).toBe('UNPLACED');
    const lying = { ...articleFixture(), status: 'UNPLACED' };
    expect(parseArticleLocationsResponse(lying, expected).ok).toBe(false);
  });

  it('fails visibly instead of truncating when caps are exceeded', () => {
    const body = articleFixture();
    body.placements = Array.from({ length: ARTICLE_LOCATIONS_LIMITS.placements + 1 }, () => body.placements[0]);
    expect(parseArticleLocationsResponse(body, expected)).toMatchObject({ ok: false, code: 'response_too_large' });
  });

  it('rejects absurd geometry', () => {
    const body = articleFixture();
    body.maps[0].hall.widthM = 1e9;
    expect(parseArticleLocationsResponse(body, expected).ok).toBe(false);
  });
});
