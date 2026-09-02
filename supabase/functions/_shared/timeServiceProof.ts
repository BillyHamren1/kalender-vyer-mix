/**
 * Planning → Time server-to-server request proof (staging service signing).
 *
 * Contract: `time-planning-service-proof.v1`
 *
 * The Planning proxy signs every upstream request with an ES256 (P-256) key
 * whose PRIVATE JWK lives only in the Planning server secret manager
 * (TIME_ADAPTER_SIGNING_PRIVATE_JWK). The Time boundary verifies the signature
 * against the corresponding PUBLIC JWK (identified by `keyId`).
 *
 * No Planning user JWT or browser credential is ever forwarded to Time.
 */

export const SERVICE_PROOF_SCHEMA = 'time-planning-service-proof.v1';
export const SERVICE_PROOF_AUDIENCE = 'time-planning-adapter';
export const SERVICE_PROOF_HEADER = 'X-EventFlow-Service-Proof';
export const SERVICE_PROOF_SIGNATURE_HEADER = 'X-EventFlow-Service-Proof-Signature';
export const MAX_PROOF_TTL_SECONDS = 60;

export interface ServiceProof {
  schema: typeof SERVICE_PROOF_SCHEMA;
  keyId: string;
  audience: typeof SERVICE_PROOF_AUDIENCE;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  operation: string;
  organizationId: string;
  payloadDigest: string;
}

export interface SignedServiceProof {
  proof: ServiceProof;
  /** base64url(JSON(proof)) — exactly what is signed. */
  encodedProof: string;
  /** base64url(ES256 signature over `encodedProof`). */
  signature: string;
}

const encoder = new TextEncoder();

export const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** SHA-256 digest of the exact JSON body that is sent upstream. */
export const sha256Base64Url = async (text: string): Promise<string> =>
  base64url(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

export const buildServiceProof = (input: {
  keyId: string;
  operation: string;
  organizationId: string;
  payloadDigest: string;
  nonce?: string;
  now?: Date;
  ttlSeconds?: number;
}): ServiceProof => {
  const ttl = Math.min(Math.max(input.ttlSeconds ?? MAX_PROOF_TTL_SECONDS, 1), MAX_PROOF_TTL_SECONDS);
  const issued = input.now ?? new Date();
  return {
    schema: SERVICE_PROOF_SCHEMA,
    keyId: input.keyId,
    audience: SERVICE_PROOF_AUDIENCE,
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + ttl * 1000).toISOString(),
    nonce: crypto.randomUUID ? crypto.randomUUID() : (input.nonce ?? `${issued.getTime()}`),
    operation: input.operation,
    organizationId: input.organizationId,
    payloadDigest: input.payloadDigest,
  };
};

export const importSigningKey = async (privateJwkJson: string): Promise<{ key: CryptoKey; keyId: string }> => {
  let jwk: JsonWebKey & { kid?: string };
  try {
    jwk = JSON.parse(privateJwkJson);
  } catch {
    throw new Error('TIME_ADAPTER_SIGNING_PRIVATE_JWK is not valid JSON');
  }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) {
    throw new Error('TIME_ADAPTER_SIGNING_PRIVATE_JWK must be a P-256 private JWK');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return { key, keyId: jwk.kid ?? 'planning-staging' };
};

export const signServiceProof = async (
  key: CryptoKey,
  proof: ServiceProof,
): Promise<SignedServiceProof> => {
  const encodedProof = base64url(encoder.encode(JSON.stringify(proof)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(encodedProof),
  );
  return { proof, encodedProof, signature: base64url(signature) };
};

/** Verification helper (used by tests and available to the Time side). */
export const verifyServiceProof = async (
  publicJwk: JsonWebKey,
  encodedProof: string,
  signature: string,
  opts: { now?: Date; expectedDigest?: string } = {},
): Promise<{ ok: true; proof: ServiceProof } | { ok: false; reason: string }> => {
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...publicJwk, key_ops: ['verify'], ext: true, d: undefined } as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const sigBytes = Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    sigBytes,
    encoder.encode(encodedProof),
  );
  if (!valid) return { ok: false, reason: 'invalid_signature' };

  let proof: ServiceProof;
  try {
    proof = JSON.parse(atob(encodedProof.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return { ok: false, reason: 'invalid_proof' };
  }
  if (proof.schema !== SERVICE_PROOF_SCHEMA) return { ok: false, reason: 'schema_mismatch' };
  if (proof.audience !== SERVICE_PROOF_AUDIENCE) return { ok: false, reason: 'audience_mismatch' };

  const now = opts.now ?? new Date();
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return { ok: false, reason: 'invalid_timestamps' };
  if (expiresAt - issuedAt > MAX_PROOF_TTL_SECONDS * 1000) return { ok: false, reason: 'ttl_too_long' };
  if (now.getTime() > expiresAt) return { ok: false, reason: 'expired' };

  if (opts.expectedDigest && opts.expectedDigest !== proof.payloadDigest) {
    return { ok: false, reason: 'digest_mismatch' };
  }
  return { ok: true, proof };
};
