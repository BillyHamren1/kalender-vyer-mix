import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import {
  buildBundleScannerInventoryRead,
  parseScannerInventoryReadGatewayRequest,
} from '../_shared/scannerInventoryReadGateway.ts'
import { signScannerRequest } from '../_shared/eventflow-scanner-bundle-contract.ts'
import {
  activeScannerSessionMatches,
  resolveScannerTokenTransport,
} from '../_shared/scannerLegacyAuth.ts'
import {
  SCANNER_SIGNED_TOKEN_PREFIX,
  scannerReleaseMatches,
  scannerReleaseShaReady,
  scannerSigningSecretReady,
  verifyScannerSignedToken,
} from '../_shared/scannerSignedAuth.ts'
import {
  preflightsScannerContract,
  requestsScannerContract,
  scannerContractResponseHeaders,
  scannerCorsHeaders,
} from '../_shared/scannerCors.ts'

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const canonicalFunctionsUrl = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1'

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    const cors = scannerCorsHeaders(
      req.headers.get('Origin'),
      Deno.env.get('SCANNER_ALLOWED_ORIGINS'),
      !preflightsScannerContract(req),
    )
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers })
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, {})

  const scannerRequest = requestsScannerContract(req)
  const releaseSha = Deno.env.get('SCANNER_RELEASE_SHA')
  const cors = scannerCorsHeaders(req.headers.get('Origin'), Deno.env.get('SCANNER_ALLOWED_ORIGINS'), false)
  const headers = scannerContractResponseHeaders(
    cors.headers,
    scannerReleaseShaReady(releaseSha) ? releaseSha : undefined,
  )
  if (!scannerRequest) return json(400, { error: 'scanner_contract_required' }, headers)
  if (!cors.allowed) return json(403, { error: 'scanner_origin_denied' }, headers)

  let body: unknown
  try { body = await req.json() } catch { return json(400, { error: 'invalid_json' }, headers) }
  const parsed = parseScannerInventoryReadGatewayRequest(body)
  if (!parsed.ok) return json(400, { error: parsed.error }, headers)

  const transport = resolveScannerTokenTransport(req.headers.get('Authorization'), null)
  if (!transport.valid || !transport.token.startsWith(`${SCANNER_SIGNED_TOKEN_PREFIX}.`)) {
    return json(401, { error: 'signed_scanner_token_required' }, headers)
  }
  const signingSecret = Deno.env.get('SCANNER_TOKEN_SIGNING_SECRET')
  if (!scannerSigningSecretReady(signingSecret) || !scannerReleaseShaReady(releaseSha)) {
    return json(503, { error: 'scanner_authentication_unavailable' }, headers)
  }
  const verified = await verifyScannerSignedToken(transport.token, signingSecret)
  if (!verified.valid || !scannerReleaseMatches(verified.claims, releaseSha)) {
    return json(401, { error: 'invalid_scanner_token' }, headers)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: staff, error: staffError } = await supabase
    .from('staff_members')
    .select('id, organization_id, active_mobile_session_id')
    .eq('id', verified.claims.staffId)
    .eq('organization_id', verified.claims.organizationId)
    .maybeSingle()
  if (
    staffError ||
    !staff ||
    !activeScannerSessionMatches(staff.active_mobile_session_id, verified.claims.sessionId)
  ) {
    return json(401, { error: 'scanner_session_revoked' }, headers)
  }

  const bundleSecret = Deno.env.get('EVENTFLOW_SCANNER_BUNDLE_SECRET') ?? ''
  const bundleUrl = Deno.env.get('EVENTFLOW_BUNDLE_FUNCTIONS_URL') ?? canonicalFunctionsUrl
  if (bundleSecret.length < 32 || !/^https:\/\//u.test(bundleUrl)) {
    return json(503, { error: 'bundle_read_not_configured' }, headers)
  }

  const bundleBody = buildBundleScannerInventoryRead({
    request: parsed.value,
    organizationId: verified.claims.organizationId,
  })
  const rawBody = JSON.stringify(bundleBody)
  const timestamp = String(Date.now())
  const nonce = crypto.randomUUID()

  let upstream: Response
  try {
    upstream = await fetch(`${bundleUrl.replace(/\/$/u, '')}/eventflow-scanner-inventory-read-v1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scanner-timestamp': timestamp,
        'x-scanner-nonce': nonce,
        'x-scanner-signature': await signScannerRequest(bundleSecret, timestamp, nonce, rawBody),
      },
      body: rawBody,
    })
  } catch {
    return json(503, { error: 'bundle_inventory_read_unavailable' }, headers)
  }

  let result: unknown
  try { result = await upstream.json() } catch {
    return json(502, { error: 'bundle_invalid_response' }, headers)
  }
  return json(upstream.status, result, headers)
}

if (import.meta.main) Deno.serve(handleRequest)
