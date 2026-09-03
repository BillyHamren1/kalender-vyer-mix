/**
 * Planning → Time server-to-server request proof.
 *
 * Contract: `time-planning-service-proof.v1`, aligned exactly with the Time v12
 * verifier (commit 5022d52ddc82d27132ab4f58a6110b0eba0a89c8).
 *
 * Wire format: ONE header `x-planning-service-proof` whose value is a compact
 * three-segment ES256 JWT:
 *   base64url(header) "." base64url(claims) "." base64url(raw WebCrypto signature)
 *
 * header: { alg: "ES256", typ: "JWT", kid: <private JWK kid> }
 * claims: { schema, aud, operation, organizationId, iat, exp, nonce, bodySha256 }
 *
 * Signing key: derived at runtime from the secret seed
 * (TIME_ADAPTER_SIGNING_SEED) via deriveSigningKeyFromSeed below. No private
 * JWK is stored anywhere and no Planning user JWT or browser credential is
 * ever forwarded to Time. The legacy TIME_ADAPTER_SIGNING_PRIVATE_JWK secret
 * is retired and must never be read by any runtime signing path.
 */

export const SERVICE_PROOF_SCHEMA = 'time-planning-service-proof.v1';
export const SERVICE_PROOF_AUDIENCE = 'eventflow-time-planning-adapter';
export const SERVICE_PROOF_HEADER = 'x-planning-service-proof';
export const MAX_PROOF_TTL_SECONDS = 60;

export interface ServiceProofClaims {
  schema: typeof SERVICE_PROOF_SCHEMA;
  aud: typeof SERVICE_PROOF_AUDIENCE;
  operation: string;
  organizationId: string;
  iat: number;
  exp: number;
  nonce: string;
  bodySha256: string;
}

export interface ServiceProofHeader {
  alg: 'ES256';
  typ: 'JWT';
  kid: string;
}

const encoder = new TextEncoder();

export const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64urlDecode = (segment: string): Uint8Array =>
  Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const base64urlJson = (value: unknown): string => base64url(encoder.encode(JSON.stringify(value)));

/** Lowercase 64-char hex SHA-256 of the exact JSON body bytes sent upstream. */
export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const buildServiceProofClaims = (input: {
  operation: string;
  organizationId: string;
  bodySha256: string;
  nonce?: string;
  now?: Date;
  ttlSeconds?: number;
}): ServiceProofClaims => {
  const ttl = Math.min(Math.max(Math.floor(input.ttlSeconds ?? MAX_PROOF_TTL_SECONDS), 1), MAX_PROOF_TTL_SECONDS);
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return {
    schema: SERVICE_PROOF_SCHEMA,
    aud: SERVICE_PROOF_AUDIENCE,
    operation: input.operation,
    organizationId: input.organizationId,
    iat,
    exp: iat + ttl,
    nonce: input.nonce ?? (crypto.randomUUID ? crypto.randomUUID() : `${iat}-${Math.random()}`),
    bodySha256: input.bodySha256,
  };
};

/**
 * TEST-FIXTURE HELPER ONLY. Imports an arbitrary P-256 private JWK so the
 * fixture tests can generate throwaway keypairs. This is intentionally NOT
 * used by any runtime signing path — production/staging signing derives its
 * key exclusively from TIME_ADAPTER_SIGNING_SEED (deriveSigningKeyFromSeed).
 */
export const importSigningKey = async (privateJwkJson: string): Promise<{ key: CryptoKey; keyId: string }> => {
  let jwk: JsonWebKey & { kid?: string };
  try {
    jwk = JSON.parse(privateJwkJson);
  } catch {
    throw new Error('signing JWK is not valid JSON');
  }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) {
    throw new Error('signing JWK must be a P-256 private JWK');
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

/** Produce the compact ES256 JWT carried in `x-planning-service-proof`. */
export const signServiceProofJwt = async (
  key: CryptoKey,
  keyId: string,
  claims: ServiceProofClaims,
): Promise<string> => {
  const header: ServiceProofHeader = { alg: 'ES256', typ: 'JWT', kid: keyId };
  const signingInput = `${base64urlJson(header)}.${base64urlJson(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
};

/** Verifier mirroring Time v12 (used by fixture tests). */
export const verifyServiceProofJwt = async (
  publicJwk: JsonWebKey,
  token: string,
  opts: { now?: Date; expectedBodySha256?: string } = {},
): Promise<{ ok: true; header: ServiceProofHeader; claims: ServiceProofClaims } | { ok: false; reason: string }> => {
  const segments = token.split('.');
  if (segments.length !== 3) return { ok: false, reason: 'malformed_token' };
  const [headerSegment, claimsSegment, signatureSegment] = segments;

  let header: ServiceProofHeader;
  let claims: ServiceProofClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerSegment)));
    claims = JSON.parse(new TextDecoder().decode(base64urlDecode(claimsSegment)));
  } catch {
    return { ok: false, reason: 'invalid_segments' };
  }
  if (header.alg !== 'ES256' || header.typ !== 'JWT' || typeof header.kid !== 'string' || !header.kid) {
    return { ok: false, reason: 'invalid_header' };
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    { ...publicJwk, key_ops: ['verify'], ext: true, d: undefined } as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64urlDecode(signatureSegment) as unknown as BufferSource,
    encoder.encode(`${headerSegment}.${claimsSegment}`),
  );
  if (!valid) return { ok: false, reason: 'invalid_signature' };

  if (claims.schema !== SERVICE_PROOF_SCHEMA) return { ok: false, reason: 'schema_mismatch' };
  if (claims.aud !== SERVICE_PROOF_AUDIENCE) return { ok: false, reason: 'audience_mismatch' };
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat <= 0 || claims.exp <= claims.iat) {
    return { ok: false, reason: 'invalid_timestamps' };
  }
  if (claims.exp - claims.iat > MAX_PROOF_TTL_SECONDS) return { ok: false, reason: 'ttl_too_long' };
  if (!/^[0-9a-f]{64}$/.test(claims.bodySha256 ?? '')) return { ok: false, reason: 'invalid_body_digest' };

  const nowSeconds = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (nowSeconds > claims.exp) return { ok: false, reason: 'expired' };
  if (opts.expectedBodySha256 && opts.expectedBodySha256 !== claims.bodySha256) {
    return { ok: false, reason: 'digest_mismatch' };
  }
  return { ok: true, header, claims };
};

// ---------------------------------------------------------------------------
// Seed-derived signing key (staging credential rotation path).
//
// The secret manager only holds a high-entropy random SEED
// (TIME_ADAPTER_SIGNING_SEED, machine-generated, never revealed anywhere).
// The ES256 private key is derived deterministically from that seed at
// runtime (HKDF-SHA-256 -> P-256 scalar -> WebCrypto import) and exists only
// in process memory. No private JWK is ever serialized into any transcript,
// secret store, file, or log. The wire contract (`time-planning-service-proof.v1`)
// is unchanged; only the public JWK / kid registered on the Time side changes.
// ---------------------------------------------------------------------------

export const SEED_DERIVATION_SALT = 'time-planning-service-proof.v1';
export const SEED_DERIVATION_INFO = 'planning-staging-es256-signing-key.v2';

/** Order n of the P-256 group (RFC 6090 / FIPS 186-4). */
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
};

const bigIntTo32Bytes = (value: bigint): Uint8Array => {
  const hex = value.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** RFC 5915 ECPrivateKey (public point omitted) wrapped in RFC 5958 PKCS#8. */
const buildPkcs8FromScalar = (d: Uint8Array): Uint8Array => {
  const ecPrivateKey = new Uint8Array([0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20, ...d]);
  const algorithmId = new Uint8Array([
    0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // id-ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // prime256v1
  ]);
  return new Uint8Array([0x30, 0x41, 0x02, 0x01, 0x00, ...algorithmId, 0x04, 0x27, ...ecPrivateKey]);
};

export interface DerivedSigningKey {
  key: CryptoKey;
  keyId: string;
  /** Safe to publish/register on the Time side. Never contains `d`. */
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string; kid: string; alg: 'ES256'; use: 'sig' };
}

/**
 * Deterministically derive the ES256 signing key from the secret seed.
 * Same seed -> same key -> same kid (RFC 7638 thumbprint of the public JWK).
 */
export const deriveSigningKeyFromSeed = async (seed: string): Promise<DerivedSigningKey> => {
  if (typeof seed !== 'string' || seed.trim().length < 32) {
    throw new Error('TIME_ADAPTER_SIGNING_SEED must be at least 32 characters');
  }
  const ikm = await crypto.subtle.importKey('raw', encoder.encode(seed), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(SEED_DERIVATION_SALT),
      info: encoder.encode(SEED_DERIVATION_INFO),
    },
    ikm,
    384,
  );
  // 384 bits mod (n-1) + 1 => uniform scalar in [1, n-1], bias < 2^-128.
  const scalar = (bytesToBigInt(new Uint8Array(bits)) % (P256_ORDER - 1n)) + 1n;
  const d = bigIntTo32Bytes(scalar);
  const pkcs8 = buildPkcs8FromScalar(d);
  d.fill(0);
  // Bootstrap import only exists to obtain the public point; the returned
  // signing key below is re-imported as NON-extractable so private material
  // can never be exported or serialized after derivation.
  const bootstrapKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8 as unknown as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  pkcs8.fill(0);
  const exported = await crypto.subtle.exportKey('jwk', bootstrapKey) as JsonWebKey;
  if (!exported.x || !exported.y || !exported.d) {
    throw new Error('Derived signing key is missing its key material');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, d: exported.d, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable: the private scalar is sealed inside WebCrypto
    ['sign'],
  );
  delete exported.d; // drop the only remaining private-scalar reference
  // RFC 7638 EC thumbprint: SHA-256 over {"crv","kty","x","y"} in that member order.
  const thumbprint = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify({ crv: 'P-256', kty: 'EC', x: exported.x, y: exported.y })),
  );
  const kid = base64url(thumbprint);
  return {
    key,
    keyId: kid,
    publicJwk: { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, kid, alg: 'ES256', use: 'sig' },
  };
};
