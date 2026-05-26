// Consolidate 2+ small/medium/large projects into ONE new large project.
// All local data follows: bookings, files, tasks, internalnotes, project_leader, address.
// Sources are soft-deleted afterwards.
//
// POST /consolidate-projects
// Body: { name: string, sources: Array<{ type: 'small'|'medium'|'large', id: string }> }
// Returns: { largeProjectId: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface SourceRef {
  type: 'small' | 'medium' | 'large';
  id: string;
}

interface ConsolidatePayload {
  name: string;
  sources: SourceRef[];
}

function badRequest(message: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: message, ...(extra || {}) }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return badRequest('Missing Authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth: verify caller token
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return badRequest('Invalid token');
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json().catch(() => null)) as ConsolidatePayload | null;
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      return badRequest('name is required');
    }
    if (!Array.isArray(body.sources) || body.sources.length < 2) {
      return badRequest('At least 2 source projects are required');
    }
    const validTypes = new Set(['small', 'medium', 'large']);
    for (const s of body.sources) {
      if (!s || !validTypes.has(s.type) || !s.id) {
        return badRequest('Invalid source entry');
      }
    }

    // Dedupe sources
    const sources: SourceRef[] = Array.from(
      new Map(body.sources.map((s) => [`${s.type}:${s.id}`, s])).values(),
    );

    // ---- Load each source ----
    type LoadedSmall = {
      kind: 'small';
      id: string;
      organization_id: string;
      booking_id: string | null;
      name: string | null;
      description: string | null;
      internalnotes: string | null;
    };
    type LoadedMedium = {
      kind: 'medium';
      id: string;
      organization_id: string;
      booking_id: string | null;
      row: any;
    };
    type LoadedLarge = {
      kind: 'large';
      id: string;
      organization_id: string;
      row: any;
      booking_ids: string[];
    };
    type LoadedSource = LoadedSmall | LoadedMedium | LoadedLarge;
    const loaded: LoadedSource[] = [];

    for (const s of sources) {
      if (s.type === 'medium') {
        const { data, error } = await admin
          .from('projects')
          .select('*')
          .eq('id', s.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) return badRequest(`Failed to load medium ${s.id}: ${error.message}`);
        if (!data) return badRequest(`Medium project ${s.id} not found or deleted`);
        loaded.push({
          kind: 'medium',
          id: data.id,
          organization_id: data.organization_id,
          booking_id: data.booking_id,
          row: data,
        });
      } else if (s.type === 'small') {
        const { data, error } = await admin
          .from('jobs')
          .select('id, organization_id, booking_id, name')
          .eq('id', s.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) return badRequest(`Failed to load small ${s.id}: ${error.message}`);
        if (!data) return badRequest(`Small project ${s.id} not found or deleted`);
        loaded.push({
          kind: 'small',
          id: data.id,
          organization_id: data.organization_id,
          booking_id: data.booking_id,
          name: (data as any).name ?? null,
          description: null,
          internalnotes: null,
        });
      } else {
        const { data, error } = await admin
          .from('large_projects')
          .select('*')
          .eq('id', s.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) return badRequest(`Failed to load large ${s.id}: ${error.message}`);
        if (!data) return badRequest(`Large project ${s.id} not found or deleted`);

        const { data: lpb } = await admin
          .from('large_project_bookings')
          .select('booking_id')
          .eq('large_project_id', s.id);

        loaded.push({
          kind: 'large',
          id: data.id,
          organization_id: data.organization_id,
          row: data,
          booking_ids: (lpb || []).map((r: any) => r.booking_id),
        });
      }
    }

    // ---- Org isolation ----
    const orgIds = new Set(loaded.map((l) => l.organization_id));
    if (orgIds.size !== 1) {
      return badRequest('All sources must belong to the same organization');
    }
    const orgId = [...orgIds][0];

    // Verify caller is in org (membership = any user_roles row for org)
    const { data: membership } = await admin
      .from('user_roles')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!membership) return badRequest('Forbidden: not a member of this organization');

    // ---- Build merged metadata (from first source where present) ----
    const sourceLabels = loaded.map((l) => {
      if (l.kind === 'small') return l.name || 'Litet projekt';
      return l.row?.name || 'Projekt';
    });

    let mergedDescription: string | null = null;
    let mergedNotes: string | null = null;
    let mergedLeader: string | null = null;
    let mergedAddress: any = null;

    for (let i = 0; i < loaded.length; i++) {
      const l = loaded[i];
      const r: any = l.kind === 'small' ? l : l.row;
      const desc: string | null = r.description ?? null;
      const notes: string | null = r.internalnotes ?? null;
      const leader: string | null = r.project_leader ?? null;

      if (!mergedDescription && desc && String(desc).trim()) {
        mergedDescription = String(desc).trim();
      }
      if (notes && String(notes).trim()) {
        const block = `--- Från "${sourceLabels[i]}" ---\n${String(notes).trim()}`;
        mergedNotes = mergedNotes ? `${mergedNotes}\n\n${block}` : block;
      }
      if (!mergedLeader && leader) mergedLeader = leader;

      if (!mergedAddress) {
        // medium uses delivery_*; large uses address_* / address
        const lat = r.address_latitude ?? r.delivery_latitude ?? null;
        const lng = r.address_longitude ?? r.delivery_longitude ?? null;
        const addr = r.address ?? r.deliveryaddress ?? null;
        if (lat != null && lng != null) {
          mergedAddress = {
            address: addr,
            address_city: r.address_city ?? r.delivery_city ?? null,
            address_postal_code: r.address_postal_code ?? r.delivery_postal_code ?? null,
            address_latitude: lat,
            address_longitude: lng,
            address_radius_meters: r.address_radius_meters ?? 100,
            address_geofence_mode: r.address_geofence_mode ?? 'circle',
            address_geofence_polygon: r.address_geofence_polygon ?? null,
          };
        }
      }
    }

    // Date arrays — union; for medium use single dates
    const startSet = new Set<string>();
    const eventSet = new Set<string>();
    const endSet = new Set<string>();
    for (const l of loaded) {
      const r: any = l.kind === 'small' ? l : l.row;
      if (l.kind === 'medium') {
        if (r.rigdaydate) startSet.add(r.rigdaydate);
        if (r.eventdate) eventSet.add(r.eventdate);
        if (r.rigdowndate) endSet.add(r.rigdowndate);
      } else if (l.kind === 'large') {
        for (const d of r.start_date || []) startSet.add(d);
        for (const d of r.event_date || []) eventSet.add(d);
        for (const d of r.end_date || []) endSet.add(d);
      }
    }

    // ---- Collect bookings ----
    const bookingIds = new Set<string>();
    for (const l of loaded) {
      if (l.kind === 'large') {
        for (const b of l.booking_ids) if (b) bookingIds.add(b);
      } else if (l.booking_id) {
        bookingIds.add(l.booking_id);
      }
    }

    // Detect bookings that already belong to a large project NOT in source set
    const sourceLargeIds = new Set(
      loaded.filter((l) => l.kind === 'large').map((l) => l.id),
    );
    if (bookingIds.size) {
      const { data: foreignLinks } = await admin
        .from('large_project_bookings')
        .select('booking_id, large_project_id')
        .in('booking_id', [...bookingIds]);
      const candidateLpIds = [
        ...new Set((foreignLinks || []).map((r: any) => r.large_project_id)),
      ].filter((id) => id && !sourceLargeIds.has(id));
      // Ignorera länkar till soft-deletade stora projekt — räknas ej som konflikt.
      let aliveLpIds = new Set<string>();
      if (candidateLpIds.length) {
        const { data: aliveLps } = await admin
          .from('large_projects')
          .select('id')
          .in('id', candidateLpIds)
          .is('deleted_at', null);
        aliveLpIds = new Set((aliveLps || []).map((r: any) => r.id));
      }
      const conflicts = (foreignLinks || []).filter(
        (r: any) =>
          !sourceLargeIds.has(r.large_project_id) &&
          aliveLpIds.has(r.large_project_id),
      );
      if (conflicts.length) {
        return badRequest(
          'En eller flera bokningar ligger redan i ett annat stort projekt',
          { conflicts },
        );
      }
    }

    // ---- Create new large project ----
    const insertPayload: any = {
      name: body.name.trim(),
      description: mergedDescription,
      internalnotes: mergedNotes,
      project_leader: mergedLeader,
      organization_id: orgId,
      status: 'planning',
      start_date: startSet.size ? [...startSet].sort() : null,
      event_date: eventSet.size ? [...eventSet].sort() : null,
      end_date: endSet.size ? [...endSet].sort() : null,
      ...(mergedAddress || {}),
    };

    const { data: created, error: createErr } = await admin
      .from('large_projects')
      .insert(insertPayload)
      .select()
      .single();
    if (createErr || !created) {
      return new Response(
        JSON.stringify({ error: `Kunde inte skapa stort projekt: ${createErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const newLpId = created.id as string;

    // From here on, on error we'll soft-delete the new large_project as compensation.
    const compensate = async (msg: string) => {
      await admin.from('large_projects').update({ deleted_at: new Date().toISOString() }).eq('id', newLpId);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    };

    // ---- Wire bookings to new large project ----
    const sortedBookingIds = [...bookingIds];
    for (let i = 0; i < sortedBookingIds.length; i++) {
      const bId = sortedBookingIds[i];
      // Remove old links pointing to source large projects
      await admin
        .from('large_project_bookings')
        .delete()
        .eq('booking_id', bId)
        .in('large_project_id', [...sourceLargeIds, newLpId]);

      const { error: linkErr } = await admin.from('large_project_bookings').insert({
        large_project_id: newLpId,
        booking_id: bId,
        organization_id: orgId,
        sort_order: i + 1,
      });
      if (linkErr) return compensate(`Kunde inte länka bokning ${bId}: ${linkErr.message}`);
    }

    // Update bookings.* references
    if (sortedBookingIds.length) {
      await admin
        .from('bookings')
        .update({
          large_project_id: newLpId,
          assigned_to_project: true,
          assigned_project_id: newLpId,
          assigned_project_name: `Stort projekt: ${insertPayload.name}`,
        })
        .in('id', sortedBookingIds);
    }

    // ---- Move/copy data from medium sources ----
    for (const l of loaded.filter((x) => x.kind === 'medium') as LoadedMedium[]) {
      // project_files -> large_project_files
      const { data: files } = await admin
        .from('project_files')
        .select('file_name, file_type, url, uploaded_by, uploaded_at')
        .eq('project_id', l.id);
      if (files?.length) {
        await admin.from('large_project_files').insert(
          files.map((f: any) => ({
            ...f,
            large_project_id: newLpId,
            organization_id: orgId,
          })),
        );
      }
      // project_tasks -> large_project_tasks
      const { data: tasks } = await admin
        .from('project_tasks')
        .select('title, description, assigned_to, deadline, completed, sort_order, is_info_only, execution_task_id')
        .eq('project_id', l.id);
      if (tasks?.length) {
        await admin.from('large_project_tasks').insert(
          tasks.map((t: any) => ({
            ...t,
            large_project_id: newLpId,
            organization_id: orgId,
          })),
        );
      }
    }

    // ---- Re-point data from large sources ----
    const largeSourceIds = loaded.filter((l) => l.kind === 'large').map((l) => l.id);
    if (largeSourceIds.length) {
      const tablesToRepoint = [
        'large_project_files',
        'large_project_tasks',
        'large_project_budget',
        'large_project_cost_lines',
        'large_project_purchases',
        'large_project_staff',
        'large_project_team_assignments',
        'large_project_gantt_steps',
      ];
      for (const tbl of tablesToRepoint) {
        const { error: repErr } = await admin
          .from(tbl as any)
          .update({ large_project_id: newLpId })
          .in('large_project_id', largeSourceIds);
        if (repErr) {
          console.error(`repoint ${tbl} failed: ${repErr.message}`);
        }
      }
    }

    // ---- Soft-delete source projects ----
    const nowIso = new Date().toISOString();
    for (const l of loaded) {
      if (l.kind === 'medium') {
        await admin.from('projects').update({ deleted_at: nowIso }).eq('id', l.id);
      } else if (l.kind === 'small') {
        await admin.from('jobs').update({ deleted_at: nowIso, status: 'cancelled' }).eq('id', l.id);
      } else {
        await admin.from('large_projects').update({ deleted_at: nowIso }).eq('id', l.id);
      }

      await (admin.from('project_audit_log') as any).insert({
        project_id: l.id,
        project_type: l.kind,
        action: 'consolidated_into',
        booking_id: null,
        performed_by: userId,
        organization_id: orgId,
        details: { target_large_project_id: newLpId, name: body.name.trim() },
      });
    }

    // Audit log on the new project
    await (admin.from('project_audit_log') as any).insert({
      project_id: newLpId,
      project_type: 'large',
      action: 'consolidation_created',
      performed_by: userId,
      organization_id: orgId,
      details: {
        sources: loaded.map((l) => ({ type: l.kind, id: l.id })),
        booking_count: sortedBookingIds.length,
      },
    });

    return new Response(
      JSON.stringify({ largeProjectId: newLpId, bookingCount: sortedBookingIds.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('consolidate-projects error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
