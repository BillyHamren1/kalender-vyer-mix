import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  buildServiceProofClaims,
  deriveSigningKeyFromSeed,
  SERVICE_PROOF_HEADER,
  sha256Hex,
  signServiceProofJwt,
} from '../_shared/timeServiceProof.ts';

type Json = Record<string, unknown>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const fail = (status: number, code: string, message: string, retryable = false) =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });

const dateOffset = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const phaseLabel = (value: unknown) => {
  const code = text(value) ?? 'arbete';
  const labels: Record<string, string> = { rig: 'Montering', event: 'Genomförande', rigDown: 'Nedmontering' };
  return { code, label: labels[code] ?? code };
};

const timeProjectRoot = (adapterUrl: string) => {
  const url = new URL(adapterUrl);
  return url.origin;
};

const callTimeAdapter = async (input: {
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  organizationId: string;
  personnelId: string;
  assignments: readonly Json[];
}) => {
  const payload = {
    schema: 'time-planning-boundary.v1',
    organizationId: input.organizationId,
    operation: 'worker.assignments.sync',
    personnelId: input.personnelId,
    assignments: input.assignments,
  };
  const body = JSON.stringify(payload);
  const { key, keyId } = await deriveSigningKeyFromSeed(input.signingSeed);
  const proof = await signServiceProofJwt(key, keyId, buildServiceProofClaims({
    operation: payload.operation,
    organizationId: input.organizationId,
    bodySha256: await sha256Hex(body),
  }));
  return fetch(`${input.adapterUrl.replace(/\/+$/, '')}/time-planning-adapter`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SERVICE_PROOF_HEADER]: proof,
      ...(input.anonKey ? { apikey: input.anonKey } : {}),
    },
    body,
  });
};

export interface WorkerAssignmentSyncContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  authorization: string;
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  timeOrganizationId?: string;
}

/**
 * Authenticate the Time personnel JWT at its owning Auth service, resolve the
 * same person by email in Planning, and push that worker's current Planning
 * assignments into Time. No Planning source row is modified.
 */
export async function handleWorkerAssignmentSync(ctx: WorkerAssignmentSyncContext): Promise<Response> {
  if (!ctx.anonKey) return fail(503, 'not_configured', 'Time Auth-nyckeln saknas för uppdragssynken.', true);

  const userResponse = await fetch(`${timeProjectRoot(ctx.adapterUrl)}/auth/v1/user`, {
    headers: { authorization: ctx.authorization, apikey: ctx.anonKey },
  }).catch(() => null);
  if (!userResponse?.ok) return fail(401, 'unauthorized', 'Time-sessionen kunde inte verifieras.');
  const timeUser = await userResponse.json().catch(() => null) as Json | null;
  const email = text(timeUser?.email)?.toLocaleLowerCase('sv-SE');
  if (!email) return fail(401, 'unauthorized', 'Time-sessionen saknar verifierad e-postadress.');

  const { data: staffRows, error: staffError } = await ctx.admin
    .from('staff_members')
    .select('id, organization_id, name, email, role, is_active')
    .ilike('email', email)
    .eq('is_active', true)
    .limit(2);
  if (staffError) return fail(500, 'planning_read_failed', 'Planning-personalen kunde inte läsas.', true);
  if (!staffRows || staffRows.length !== 1) {
    return fail(404, 'personnel_not_mapped', 'E-postadressen matchar inte exakt en aktiv person i Planning.');
  }
  const staff = staffRows[0] as Json;
  const sourceOrganizationId = String(staff.organization_id);
  const timeOrganizationId = ctx.timeOrganizationId ?? sourceOrganizationId;
  if (timeOrganizationId !== sourceOrganizationId) {
    return fail(409, 'organization_mapping_mismatch', 'Planning- och Time-organisationen är inte samma kopplade organisation.');
  }

  const from = dateOffset(-14);
  const to = dateOffset(60);
  const { data: staffAssignments, error: assignmentError } = await ctx.admin
    .from('staff_assignments')
    .select('id, staff_id, team_id, assignment_date, updated_at, organization_id')
    .eq('organization_id', sourceOrganizationId)
    .eq('staff_id', String(staff.id))
    .gte('assignment_date', from)
    .lte('assignment_date', to);
  if (assignmentError) return fail(500, 'planning_read_failed', 'Planning-tilldelningarna kunde inte läsas.', true);

  const pairs = new Set((staffAssignments ?? []).map((row: Json) => `${row.assignment_date}:${row.team_id}`));
  const teamIds = [...new Set((staffAssignments ?? []).map((row: Json) => String(row.team_id)))];
  const { data: calendarRows, error: calendarError } = teamIds.length
    ? await ctx.admin.from('calendar_events')
      .select('id, resource_id, booking_id, title, start_time, end_time, event_type, delivery_address, booking_number, organization_id, source_date')
      .eq('organization_id', sourceOrganizationId)
      .in('resource_id', teamIds)
      .gte('source_date', from)
      .lte('source_date', to)
    : { data: [], error: null };
  if (calendarError) return fail(500, 'planning_read_failed', 'Planning-kalendern kunde inte läsas.', true);
  const calendar = (calendarRows ?? []).filter((row: Json) => pairs.has(`${row.source_date}:${row.resource_id}`));

  const bookingIds = [...new Set(calendar.map((row: Json) => text(row.booking_id)).filter(Boolean))] as string[];
  const { data: bookings, error: bookingError } = bookingIds.length
    ? await ctx.admin.from('bookings')
      .select('id, title, client, status, version, updated_at, booking_number, deliveryaddress, delivery_latitude, delivery_longitude, contact_name, contact_phone, assigned_project_id, assigned_project_name, organization_id')
      .eq('organization_id', sourceOrganizationId)
      .in('id', bookingIds)
    : { data: [], error: null };
  if (bookingError) return fail(500, 'planning_read_failed', 'Planning-bokningarna kunde inte läsas.', true);
  const { data: projects, error: projectError } = bookingIds.length
    ? await ctx.admin.from('projects')
      .select('id, booking_id, name, updated_at, deliveryaddress, delivery_latitude, delivery_longitude, address_radius_meters, organization_id, deleted_at')
      .eq('organization_id', sourceOrganizationId)
      .in('booking_id', bookingIds)
      .is('deleted_at', null)
    : { data: [], error: null };
  if (projectError) return fail(500, 'planning_read_failed', 'Planning-projekten kunde inte läsas.', true);

  const bookingById = new Map((bookings ?? []).map((row: Json) => [String(row.id), row]));
  const projectByBooking = new Map<string, Json>();
  for (const project of projects ?? []) {
    const row = project as Json;
    if (!projectByBooking.has(String(row.booking_id))) projectByBooking.set(String(row.booking_id), row);
  }

  const assignments: Json[] = [];
  for (const event of calendar) {
    const startsAt = text(event.start_time);
    const endsAt = text(event.end_time);
    const bookingId = text(event.booking_id);
    if (!startsAt || !endsAt || !bookingId || Date.parse(startsAt) >= Date.parse(endsAt)) continue;
    const booking = bookingById.get(bookingId);
    if (!booking || String(booking.status).toUpperCase() !== 'CONFIRMED') continue;
    const project = projectByBooking.get(bookingId);
    const location = {
      address: text(project?.deliveryaddress) ?? text(booking.deliveryaddress) ?? text(event.delivery_address) ?? undefined,
      latitude: finite(project?.delivery_latitude) ?? finite(booking.delivery_latitude),
      longitude: finite(project?.delivery_longitude) ?? finite(booking.delivery_longitude),
      radiusM: finite(project?.address_radius_meters) ?? 100,
    };
    const sourceVersion = await sha256Hex(JSON.stringify({
      eventId: event.id, startsAt, endsAt, eventType: event.event_type,
      bookingVersion: booking.version, bookingUpdatedAt: booking.updated_at,
      projectId: project?.id ?? null, projectUpdatedAt: project?.updated_at ?? null,
      location,
    }));
    assignments.push({
      sourceAssignmentId: String(event.id),
      sourceVersion,
      workerExternalId: String(staff.id),
      workDate: String(event.source_date),
      startsAt,
      endsAt,
      roleLabel: text(staff.role) ?? 'Tilldelad',
      teamLabel: String(event.resource_id),
      target: {
        sourceSystem: 'planning',
        kind: project ? 'project' : 'booking',
        externalId: String(project?.id ?? booking.id),
        version: sourceVersion,
        label: text(project?.name) ?? text(booking.assigned_project_name) ?? text(event.title) ?? text(booking.title) ?? String(booking.booking_number),
        bookingNumber: text(booking.booking_number) ?? text(event.booking_number) ?? undefined,
        phase: phaseLabel(event.event_type),
        location,
        reporting: { state: 'allowed' },
      },
      workerDetail: {
        address: location.address,
        contactName: text(booking.contact_name) ?? undefined,
        contactPhone: text(booking.contact_phone) ?? undefined,
      },
    });
  }
  assignments.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

  let upstream: Response;
  try {
    upstream = await callTimeAdapter({
      adapterUrl: ctx.adapterUrl,
      anonKey: ctx.anonKey,
      signingSeed: ctx.signingSeed,
      organizationId: timeOrganizationId,
      personnelId: String(staff.id),
      assignments,
    });
  } catch (error) {
    return fail(503, 'upstream_unavailable', `Time-gränsen kunde inte nås: ${(error as Error)?.message ?? 'okänt fel'}`, true);
  }
  const upstreamBody = await upstream.json().catch(() => null) as Json | null;
  if (!upstream.ok) {
    return fail(upstream.status, text(upstreamBody?.code) ?? 'import_rejected', text(upstreamBody?.error) ?? `Time-gränsen svarade ${upstream.status}.`);
  }
  return json(200, {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: 'time-planning-adapter.v2',
    operation: 'worker.assignments.sync',
    generatedAt: new Date().toISOString(),
    data: { assignmentCount: assignments.length, from, to, receipt: upstreamBody?.data ?? null },
  });
}
