import { describe, expect, it } from 'vitest';
import {
  buildTimeWmsProjectionRequest,
  fetchTimeWmsProjection,
  hmacSha256Hex,
  normalizeTimeWmsProjectionBody,
} from '../../supabase/functions/_shared/timeWmsProjection';

const actor = {
  organizationId: 'f5e5cade-f08b-4833-a105-56461f15b191',
  personnelId: '11111111-1111-4111-8111-111111111111',
  label: 'Planning Test',
};

describe('Time-WMS projection transport', () => {
  it('signerar exakt timestamp.nonce.rawBody och skickar endast serverkontraktets headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = buildTimeWmsProjectionRequest({
      bookingId: 'e8065d07-d5f3-4ad2-a8c7-b834c5baa8a7',
      bookingNumber: '2609-41',
      deviceId: 'planning-web:11111111-1111-4111-8111-111111111111',
      actor,
    });
    const secret = 'server-secret-never-in-browser';
    const result = await fetchTimeWmsProjection(request, {
      hmacSecret: secret,
      endpoint: 'https://wms.invalid/outbound/projection',
      now: () => new Date('2026-09-22T12:00:00.000Z'),
      nonce: () => 'nonce123456789012',
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({
          bookingId: request.bookingId,
          reservationId: 'reservation-1',
          revision: 7,
          lines: [],
        }), { status: 200 });
      }) as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const rawBody = String(calls[0].init?.body);
    expect(JSON.parse(rawBody)).toEqual({
      schema: 'time-wms-outbound-projection-request.v1',
      bookingId: 'e8065d07-d5f3-4ad2-a8c7-b834c5baa8a7',
      bookingNumber: '2609-41',
      reservationId: null,
      deviceId: 'planning-web:11111111-1111-4111-8111-111111111111',
      actor,
    });
    const isoTimestamp = new Date(1790078400 * 1000).toISOString();
    const expected = await hmacSha256Hex(
      secret,
      `${isoTimestamp}.nonce123456789012.${rawBody}`,
    );
    expect(calls[0].init?.headers).toEqual({
      'content-type': 'application/json',
      accept: 'application/json',
      'x-time-timestamp': isoTimestamp,
      'x-time-nonce': 'nonce123456789012',
      'x-time-signature': expected,
    });
  });

  it('stoppar före nätverk vid saknad secret eller aktör', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{}');
    }) as typeof fetch;
    const request = buildTimeWmsProjectionRequest({
      bookingId: 'booking-1',
      bookingNumber: '2609-41',
      deviceId: 'planning-web:user-1',
      actor,
    });
    expect(await fetchTimeWmsProjection(request, { hmacSecret: '', fetchImpl }))
      .toMatchObject({ ok: false, code: 'wms_not_configured' });
    expect(await fetchTimeWmsProjection(
      { ...request, actor: { ...actor, personnelId: '' } },
      { hmacSecret: 'configured-secret', fetchImpl },
    )).toMatchObject({ ok: false, code: 'wms_bad_response' });
    expect(calls).toBe(0);
  });

  it('bevarar paketmedlemmar och tillbehör som skilda relationer', () => {
    const body = normalizeTimeWmsProjectionBody({
      bookingId: 'booking-1',
      reservationId: 'reservation-1',
      revision: 2,
      lines: [
        { reservationLineId: 'package-1', kind: 'group', parentLineId: null, label: 'Multiflex', requiredQuantity: 1, packedQuantity: 0 },
        { reservationLineId: 'member-1', kind: 'line', parentLineId: 'package-1', relationshipKind: 'package_member', label: 'Ben', requiredQuantity: 4, packedQuantity: 1 },
        { reservationLineId: 'accessory-1', kind: 'line', parentLineId: 'package-1', relationshipKind: 'accessory', label: 'Vägg', requiredQuantity: 2, packedQuantity: 0 },
      ],
    });
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({ type: 'package', name: 'Multiflex' });
    expect(body.lines[0].components).toEqual([
      expect.objectContaining({ line_id: 'member-1', name: 'Ben' }),
    ]);
    expect(body.lines[1]).toMatchObject({
      line_id: 'accessory-1',
      parent_line_id: 'package-1',
      is_accessory: true,
    });
  });
});