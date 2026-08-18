/**
 * Server-side tenant guard (fail-closed).
 *
 * KRITISK SÄKERHETSREGEL:
 * En service-role-funktion får ALDRIG falla tillbaka på "första organisationen"
 * (`from('organizations').select('id').limit(1)`). Det mönstret gör att data
 * från en godtycklig tenant (i praktiken den äldsta/största kunden) kan skrivas
 * eller läsas åt en annan tenant.
 *
 * Kan organisationen inte bevisas → DENY, aldrig FALLBACK.
 */

export class TenantResolutionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'TENANT_UNRESOLVED') {
    super(message);
    this.name = 'TenantResolutionError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Verifierar att ett explicit angivet organization_id finns och returnerar det.
 * Kastar TenantResolutionError när det saknas eller inte kan verifieras.
 */
export async function requireOrganizationId(
  admin: { from: (t: string) => any },
  explicitOrgId?: string | null,
  context = 'request',
): Promise<string> {
  if (!explicitOrgId) {
    throw new TenantResolutionError(
      `organization_id saknas för ${context} – fail-closed (ingen fallback till annan organisation)`,
      400,
      'ORGANIZATION_ID_REQUIRED',
    );
  }

  const { data, error } = await admin
    .from('organizations')
    .select('id')
    .eq('id', explicitOrgId)
    .maybeSingle();

  if (error) {
    throw new TenantResolutionError(
      `Kunde inte verifiera organisation för ${context}: ${error.message}`,
      403,
      'ORGANIZATION_VERIFICATION_FAILED',
    );
  }
  if (!data?.id) {
    throw new TenantResolutionError(
      `Organization not found: ${explicitOrgId}`,
      404,
      'ORGANIZATION_NOT_FOUND',
    );
  }
  return data.id as string;
}

/**
 * Härleder organisationen från en befintlig rad (t.ex. vehicles, bookings).
 * Fail-closed när raden saknas eller saknar organization_id.
 */
export async function organizationIdFromRow(
  admin: { from: (t: string) => any },
  table: string,
  id: string,
  idColumn = 'id',
): Promise<string> {
  const { data, error } = await admin
    .from(table)
    .select('organization_id')
    .eq(idColumn, id)
    .maybeSingle();

  if (error) {
    throw new TenantResolutionError(
      `Kunde inte läsa organisation från ${table}: ${error.message}`,
      403,
      'ORGANIZATION_VERIFICATION_FAILED',
    );
  }
  if (!data?.organization_id) {
    throw new TenantResolutionError(
      `Rad i ${table} saknar organization_id (${idColumn}=${id})`,
      403,
      'ORGANIZATION_MISSING_ON_ROW',
    );
  }
  return data.organization_id as string;
}

/** Kastar när två organisationer inte matchar. */
export function assertSameOrganization(
  expected: string | null | undefined,
  actual: string | null | undefined,
  context = 'resource',
): void {
  if (!expected || !actual || expected !== actual) {
    throw new TenantResolutionError(
      `Cross-tenant access nekad för ${context}`,
      403,
      'CROSS_TENANT_DENIED',
    );
  }
}
