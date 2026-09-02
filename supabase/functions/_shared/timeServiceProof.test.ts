import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildServiceProof,
  importSigningKey,
  MAX_PROOF_TTL_SECONDS,
  sha256Base64Url,
  signServiceProof,
  SERVICE_PROOF_AUDIENCE,
  SERVICE_PROOF_SCHEMA,
  verifyServiceProof,
} from './timeServiceProof.ts';

const generate = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey & { kid?: string };
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey & { kid?: string };
  priv.kid = 'test-key';
  pub.kid = 'test-key';
  return { priv, pub };
};

Deno.test('signs and verifies a service proof bound to the exact payload', async () => {
  const { priv, pub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const payload = JSON.stringify({ schema: 'time-planning-boundary.v1', operation: 'status' });
  const digest = await sha256Base64Url(payload);
  const proof = buildServiceProof({ keyId, operation: 'status', organizationId: 'org-1', payloadDigest: digest });
  const signed = await signServiceProof(key, proof);

  assertEquals(proof.schema, SERVICE_PROOF_SCHEMA);
  assertEquals(proof.audience, SERVICE_PROOF_AUDIENCE);
  const result = await verifyServiceProof(pub, signed.encodedProof, signed.signature, { expectedDigest: digest });
  assert(result.ok, 'proof should verify');
});

Deno.test('rejects a proof whose payload digest does not match', async () => {
  const { priv, pub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const digest = await sha256Base64Url('{"a":1}');
  const signed = await signServiceProof(
    key,
    buildServiceProof({ keyId, operation: 'days.queue', organizationId: 'org-1', payloadDigest: digest }),
  );
  const other = await sha256Base64Url('{"a":2}');
  const result = await verifyServiceProof(pub, signed.encodedProof, signed.signature, { expectedDigest: other });
  assertEquals(result.ok, false);
  assertEquals((result as { reason: string }).reason, 'digest_mismatch');
});

Deno.test('proof ttl is capped at 60 seconds and expires', async () => {
  const { priv, pub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const now = new Date('2026-01-01T10:00:00.000Z');
  const proof = buildServiceProof({
    keyId,
    operation: 'status',
    organizationId: 'org-1',
    payloadDigest: await sha256Base64Url('{}'),
    ttlSeconds: 600,
    now,
  });
  assertEquals(Date.parse(proof.expiresAt) - Date.parse(proof.issuedAt), MAX_PROOF_TTL_SECONDS * 1000);

  const signed = await signServiceProof(key, proof);
  const expired = await verifyServiceProof(pub, signed.encodedProof, signed.signature, {
    now: new Date('2026-01-01T10:05:00.000Z'),
  });
  assertEquals(expired.ok, false);
  assertEquals((expired as { reason: string }).reason, 'expired');
});

Deno.test('rejects a tampered proof and a foreign key', async () => {
  const { priv } = await generate();
  const { pub: otherPub } = await generate();
  const { key, keyId } = await importSigningKey(JSON.stringify(priv));
  const signed = await signServiceProof(
    key,
    buildServiceProof({ keyId, operation: 'status', organizationId: 'org-1', payloadDigest: await sha256Base64Url('{}') }),
  );
  const foreign = await verifyServiceProof(otherPub, signed.encodedProof, signed.signature);
  assertEquals(foreign.ok, false);

  const tampered = await verifyServiceProof(
    otherPub,
    signed.encodedProof.slice(0, -4) + 'AAAA',
    signed.signature,
  );
  assertEquals(tampered.ok, false);
});

Deno.test('nonces are unique per proof', async () => {
  const digest = await sha256Base64Url('{}');
  const a = buildServiceProof({ keyId: 'k', operation: 'status', organizationId: 'o', payloadDigest: digest });
  const b = buildServiceProof({ keyId: 'k', operation: 'status', organizationId: 'o', payloadDigest: digest });
  assert(a.nonce !== b.nonce);
});
