import { describe, expect, it, vi } from 'vitest'
import { authenticateScannerParcel, type ParcelScannerAuthDependencies } from '../../supabase/functions/_shared/scannerParcelAuth'
import { scannerStaffAccessAllowed } from '../../supabase/functions/_shared/scannerHubAccess'
import { createScannerSignedToken } from '../../supabase/functions/_shared/scannerSignedAuth'

const signingSecret = 'test-only-scanner-signing-secret-32-bytes'
const releaseSha = 'a'.repeat(40)
const staff = { id: 'staff-1', organization_id: 'org-1', active_mobile_session_id: 'session-1' }
const claims = { staffId: staff.id, organizationId: staff.organization_id, sessionId: 'session-1', releaseSha }
const signedRequest = async (overrides = {}) => new Request('https://scanner.test/parcel', {
  method: 'POST',
  headers: { Authorization: `Bearer ${await createScannerSignedToken({ ...claims, ...overrides }, signingSecret)}` },
})
const dependencies = (): ParcelScannerAuthDependencies => ({
  signingSecret, releaseSha,
  findStaff: vi.fn().mockResolvedValue({ data: staff, error: null }),
  currentAccessAllowed: vi.fn().mockResolvedValue(true),
})

describe('Scanner parcel current authority', () => {
  it('allows an active signed identity only after fresh server-owned access proof', async () => {
    const deps = dependencies()
    expect(await authenticateScannerParcel(await signedRequest(), deps)).toEqual({
      ok: true, staffId: 'staff-1', organizationId: 'org-1',
    })
    expect(deps.findStaff).toHaveBeenCalledWith('staff-1', 'org-1')
    expect(deps.currentAccessAllowed).toHaveBeenCalledWith('staff-1', 'org-1')
  })

  it('denies the same still-valid signed session immediately after HUB revokes Scanner', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
    const deps = { ...dependencies(), currentAccessAllowed: (staffId: string, organizationId: string) =>
      scannerStaffAccessAllowed({ rpc }, staffId, organizationId) }
    const req = await signedRequest()
    expect((await authenticateScannerParcel(req, deps)).ok).toBe(true)
    expect(await authenticateScannerParcel(req, deps)).toEqual({
      ok: false, status: 403, error: 'scanner_access_revoked',
    })
    expect(rpc).toHaveBeenLastCalledWith('scanner_staff_access_allowed', { _staff_id: 'staff-1', _organization_id: 'org-1' })
  })

  it.each([
    { data: null, error: new Error('unavailable') },
    { data: 'true', error: null },
    { data: null, error: null },
  ])('fails closed when the current authority result is not verified true: %j', async result => {
    const rpc = vi.fn().mockResolvedValue(result)
    const deps = { ...dependencies(), currentAccessAllowed: (staffId: string, organizationId: string) =>
      scannerStaffAccessAllowed({ rpc }, staffId, organizationId) }
    expect(await authenticateScannerParcel(await signedRequest(), deps)).toEqual({
      ok: false, status: 403, error: 'scanner_access_revoked',
    })
  })

  it.each([
    { ...staff, active_mobile_session_id: 'replacement-session' },
    { ...staff, active_mobile_session_id: null },
    { ...staff, active_mobile_session_id: '' },
    { ...staff, active_mobile_session_id: '   ' },
    { ...staff, organization_id: 'other-org' },
    { ...staff, id: 'other-staff' },
    null,
  ])('denies revoked, missing or mismatched staff before checking module access: %j', async data => {
    const deps = dependencies()
    deps.findStaff = vi.fn().mockResolvedValue({ data, error: null })
    expect(await authenticateScannerParcel(await signedRequest(), deps)).toEqual({
      ok: false, status: 401, error: 'scanner_session_revoked',
    })
    expect(deps.currentAccessAllowed).not.toHaveBeenCalled()
  })

  it('rejects a signed credential for another release before any data access', async () => {
    const deps = dependencies()
    expect(await authenticateScannerParcel(await signedRequest({ releaseSha: 'b'.repeat(40) }), deps)).toEqual({
      ok: false, status: 401, error: 'invalid_scanner_token',
    })
    expect(deps.findStaff).not.toHaveBeenCalled()
  })

  it('rejects unsigned legacy credentials before any data access', async () => {
    const deps = dependencies()
    expect(await authenticateScannerParcel(new Request('https://scanner.test', { headers: { Authorization: 'Bearer legacy-token' } }), deps)).toEqual({
      ok: false, status: 401, error: 'signed_scanner_token_required',
    })
    expect(deps.findStaff).not.toHaveBeenCalled()
  })

  it('fails closed when authority lookup throws', async () => {
    const deps = dependencies()
    deps.currentAccessAllowed = vi.fn().mockRejectedValue(new Error('unavailable'))
    expect(await authenticateScannerParcel(await signedRequest(), deps)).toEqual({
      ok: false, status: 503, error: 'scanner_authentication_unavailable',
    })
  })
})
