import { activeScannerSessionMatches, resolveScannerTokenTransport } from './scannerLegacyAuth.ts'
import {
  SCANNER_SIGNED_TOKEN_PREFIX,
  scannerReleaseMatches,
  scannerReleaseShaReady,
  scannerSigningSecretReady,
  verifyScannerSignedToken,
} from './scannerSignedAuth.ts'

export type ParcelScannerStaff = {
  id: string
  organization_id: string
  active_mobile_session_id: string | null
}

export type ParcelScannerAuthDependencies = {
  signingSecret: string | undefined
  releaseSha: string | undefined
  findStaff: (staffId: string, organizationId: string) => PromiseLike<{
    data: ParcelScannerStaff | null
    error: unknown
  }>
  currentAccessAllowed: (staffId: string, organizationId: string) => PromiseLike<boolean>
}

/** A signed identity never freezes HUB's current Scanner authority. */
export async function authenticateScannerParcel(req: Request, deps: ParcelScannerAuthDependencies) {
  const transport = resolveScannerTokenTransport(req.headers.get('Authorization'), null)
  if (!transport.valid || !transport.token.startsWith(`${SCANNER_SIGNED_TOKEN_PREFIX}.`)) {
    return { ok: false as const, status: 401, error: 'signed_scanner_token_required' }
  }
  if (!scannerSigningSecretReady(deps.signingSecret) || !scannerReleaseShaReady(deps.releaseSha)) {
    return { ok: false as const, status: 503, error: 'scanner_authentication_unavailable' }
  }
  const verified = await verifyScannerSignedToken(transport.token, deps.signingSecret)
  if (!verified.valid || !scannerReleaseMatches(verified.claims, deps.releaseSha)) {
    return { ok: false as const, status: 401, error: 'invalid_scanner_token' }
  }
  try {
    const { data: staff, error } = await deps.findStaff(verified.claims.staffId, verified.claims.organizationId)
    if (error || !staff || staff.id !== verified.claims.staffId ||
      staff.organization_id !== verified.claims.organizationId ||
      typeof staff.active_mobile_session_id !== 'string' || staff.active_mobile_session_id.trim().length === 0 ||
      !activeScannerSessionMatches(staff.active_mobile_session_id, verified.claims.sessionId)) {
      return { ok: false as const, status: 401, error: 'scanner_session_revoked' }
    }
    if (!await deps.currentAccessAllowed(staff.id, staff.organization_id)) {
      return { ok: false as const, status: 403, error: 'scanner_access_revoked' }
    }
    return { ok: true as const, staffId: staff.id, organizationId: staff.organization_id }
  } catch {
    return { ok: false as const, status: 503, error: 'scanner_authentication_unavailable' }
  }
}
