import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildServiceProofClaims,
  importSigningKey,
  MAX_PROOF_TTL_SECONDS,
  SERVICE_PROOF_AUDIENCE,
  SERVICE_PROOF_HEADER,
  SERVICE_PROOF_SCHEMA,
  sha256Hex,
  signServiceProofJwt,
  verifyServiceProofJwt,
} from './timeServiceProof.ts';

const decodeSegment = (segment: string) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ),
  );

const generate = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey & { kid?: string };
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey & { kid?: string };
  priv.kid = 'test-key';
  pub.kid = 'test-key';
  return { priv, pub };
};

Deno.test('header name matches the Time v12 verifier exactly', () => {
  assertEquals(SERVICE_PROOF_HEADER, 'x-planning-service-proof');
  assertEquals(SERVICE_PROOF_AUDIENCE, 'eventflow-time-planning-adapter');
  assertEquals(SERVICE_PROOF_SCHEMA, 'time-planning-service-proof.v1');
});

Deno.test('produces a compact three-segment ES256 JWT with exact header/claim keys', async () => {
  const { priv } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const bodyText = JSON.stringify({ schema: 'time-planning-boundary.v1', operation: 'status' });
  const bodySha256 = await sha256Hex(bodyText);
  const token = await signServiceProofJwt(
    key,
    keyId,
    buildServiceProofClaims({ operation: 'status', organizationId: 'org-1', bodySha256 }),
  );

  const segments = token.split('.');
  assertEquals(segments.length, 3);
  assertEquals(decodeSegment(segments[0]), { alg: 'ES256', typ: 'JWT', kid: 'test-key' });
  const claims = decodeSegment(segments[1]);
  assertEquals(Object.keys(claims).sort(), [
    'aud', 'bodySha256', 'exp', 'iat', 'nonce', 'operation', 'organizationId', 'schema',
  ]);
  assertMatch(claims.bodySha256, /^[0-9a-f]{64}$/);
  assert(Number.isInteger(claims.iat) && claims.iat > 0);
  assert(claims.exp - claims.iat <= MAX_PROOF_TTL_SECONDS);
});

Deno.test('verifier accepts the signed token and binds it to the exact body bytes', async () => {
  const { priv, pub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const bodyText = JSON.stringify({ a: 1 });
  const bodySha256 = await sha256Hex(bodyText);
  const token = await signServiceProofJwt(
    key,
    keyId,
    buildServiceProofClaims({ operation: 'days.queue', organizationId: 'org-1', bodySha256 }),
  );

  const ok = await verifyServiceProofJwt(pub, token, { expectedBodySha256: bodySha256 });
  assert(ok.ok, 'token should verify');

  const mismatch = await verifyServiceProofJwt(pub, token, { expectedBodySha256: await sha256Hex('{"a":2}') });
  assertEquals(mismatch.ok, false);
  assertEquals((mismatch as { reason: string }).reason, 'digest_mismatch');
});

Deno.test('sha256Hex is lowercase hex of the exact bytes', async () => {
  assertEquals(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

Deno.test('ttl is capped at 60 seconds and expired tokens are rejected', async () => {
  const { priv, pub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const now = new Date('2026-01-01T10:00:00.000Z');
  const claims = buildServiceProofClaims({
    operation: 'status',
    organizationId: 'org-1',
    bodySha256: await sha256Hex('{}'),
    ttlSeconds: 600,
    now,
  });
  assertEquals(claims.exp - claims.iat, MAX_PROOF_TTL_SECONDS);

  const token = await signServiceProofJwt(key, keyId, claims);
  const expired = await verifyServiceProofJwt(pub, token, { now: new Date('2026-01-01T10:05:00.000Z') });
  assertEquals(expired.ok, false);
  assertEquals((expired as { reason: string }).reason, 'expired');
});

Deno.test('rejects tampered claims and foreign keys', async () => {
  const { priv } = await generate();
  const { pub: otherPub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const token = await signServiceProofJwt(
    key,
    keyId,
    buildServiceProofClaims({ operation: 'status', organizationId: 'org-1', bodySha256: await sha256Hex('{}') }),
  );
  assertEquals((await verifyServiceProofJwt(otherPub, token)).ok, false);

  const [h, c, s] = token.split('.');
  const tampered = `${h}.${c.slice(0, -4)}AAAA.${s}`;
  assertEquals((await verifyServiceProofJwt(otherPub, tampered)).ok, false);
});

Deno.test('nonces are unique per proof', async () => {
  const bodySha256 = await sha256Hex('{}');
  const a = buildServiceProofClaims({ operation: 'status', organizationId: 'o', bodySha256 });
  const b = buildServiceProofClaims({ operation: 'status', organizationId: 'o', bodySha256 });
  assert(a.nonce !== b.nonce);
});
