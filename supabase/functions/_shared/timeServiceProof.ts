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
 * The ES256 private JWK lives only in the Planning server secret manager
 * (TIME_ADAPTER_SIGNING_PRIVATE_JWK). No Planning user JWT or browser
 * credential is ever forwarded to Time.
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
