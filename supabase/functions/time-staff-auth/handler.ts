import { timingSafeEqual } from 'node:crypto'

const schema = 'time-operations-auth.v1'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const maxBytes = 4096
const encoder = new TextEncoder()

export interface Staff {
  staffId: string
  organizationId: string
  displayName: string
  email: string | null
}

interface CredentialMatch extends Staff {
  active: boolean
  passwordHash: string
}

export interface Directory {
  findCredentials(identifier: string): Promise<CredentialMatch[]>
  findActiveStaff(organizationId: string, staffId: string): Promise<Staff | null>
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const failure = (status: number) => json(status, { schema, error: 'Operations staff authentication failed' })

async function equal(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([left, right].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let body = ''
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined)
        return null
      }
      body += decoder.decode(value, { stream: true })
    }
    const parsed: unknown = JSON.parse(body + decoder.decode())
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function publicStaff(staff: Staff): Staff {
  const { staffId, organizationId, displayName, email } = staff
  return { staffId, organizationId, displayName, email }
}

export const createStaffAuthHandler = (secret: string, directory: Directory) => async (request: Request) => {
  if (request.method !== 'POST') return failure(405)
  if (secret.length < 32) return failure(503)
  const presented = request.headers.get('x-time-operations-secret')
  if (!presented || presented.length > 512 || !await equal(secret, presented)) return failure(401)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure(415)
  const body = await readBody(request)
  if (!body || body.schema !== schema || Object.keys(body).length !== 4) return failure(400)

  try {
    if (body.action === 'verify_credentials') {
      const { identifier, password } = body
      if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254 ||
          typeof password !== 'string' || !password || password.length > 1024) return failure(400)

      // Match the existing Operations account representation. Credentials never leave this server.
      let encoded: string
      try { encoded = btoa(password) } catch { return failure(401) }
      const matches = await directory.findCredentials(identifier.trim())
      if (matches.length !== 1 || !await equal(matches[0].passwordHash, encoded)) return failure(401)
      if (!matches[0].active) return failure(403)
      return json(200, { schema, staff: publicStaff(matches[0]) })
    }

    if (body.action === 'resolve_active') {
      const { organizationId, staffId } = body
      if (typeof organizationId !== 'string' || !uuid.test(organizationId) ||
          typeof staffId !== 'string' || !staffId.trim() || staffId.length > 255) return failure(400)
      const staff = await directory.findActiveStaff(organizationId, staffId)
      if (!staff || staff.staffId !== staffId || staff.organizationId !== organizationId.toLowerCase()) return failure(403)
      return json(200, { schema, staff: publicStaff(staff) })
    }
    return failure(400)
  } catch {
    return failure(503)
  }
}
