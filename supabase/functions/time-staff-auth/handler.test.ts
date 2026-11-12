import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'vitest'
import { createStaffAuthHandler, type Directory } from './handler.ts'

const secret = 'test-secret-with-at-least-32-characters'
const schema = 'time-operations-auth.v1'
const staff = {
  staffId: 'staff-Operations-42',
  organizationId: '75eae390-85f2-4d36-9088-36697b258e90',
  displayName: 'Test Worker',
  email: null,
}
const credential = { ...staff, active: true, passwordHash: btoa('test-password') }
const login = { schema, action: 'verify_credentials', identifier: 'test-worker', password: 'test-password' }
const lookup = { schema, action: 'resolve_active', staffId: staff.staffId, organizationId: staff.organizationId }
const request = (body: unknown, key = secret) => new Request('https://test.invalid/time-staff-auth', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-time-operations-secret': key },
  body: JSON.stringify(body),
})
const directory: Directory = {
  async findCredentials(identifier) { return identifier === 'test-worker' ? [credential] : [] },
  async findActiveStaff() { return staff },
}

test('Operations login returns the exact opaque staff ID and no credentials or Scanner session', async () => {
  const response = await createStaffAuthHandler(secret, directory)(request(login))
  equal(response.status, 200)
  deepEqual(await response.json(), { schema, staff })
  equal(response.headers.get('cache-control'), 'no-store')
})

test('wrong service secret, bad password, duplicate matches and inactive account are rejected', async () => {
  equal((await createStaffAuthHandler('', directory)(request(login))).status, 503)
  equal((await createStaffAuthHandler(secret, directory)(request(login, 'wrong'))).status, 401)
  equal((await createStaffAuthHandler(secret, directory)(request({ ...login, password: 'wrong' }))).status, 401)
  const ambiguous = { ...directory, async findCredentials() { return [credential, credential] } }
  equal((await createStaffAuthHandler(secret, ambiguous)(request(login))).status, 401)
  const inactive = { ...directory, async findCredentials() { return [{ ...credential, active: false }] } }
  equal((await createStaffAuthHandler(secret, inactive)(request(login))).status, 403)
})

test('the authenticated lookup binds both organization and exact staff ID', async () => {
  const handle = createStaffAuthHandler(secret, directory)
  equal((await handle(request(lookup))).status, 200)
  equal((await handle(request({ ...lookup, staffId: staff.staffId.toLowerCase() }))).status, 403)
  equal((await handle(request({ ...lookup, organizationId: 'a963aa59-30d1-4989-a04f-3cfcb22f7d89' }))).status, 403)
  equal((await handle(request({ ...login, staffId: staff.staffId }))).status, 400)
  equal((await handle(request({ ...login, password: 'a'.repeat(5000) }))).status, 400)
})
