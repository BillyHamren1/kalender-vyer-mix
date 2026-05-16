// Records a lightweight app health event from the mobile app.
// Diagnostics-only — NEVER creates work time, time_reports or feeds the
// Time Engine. Multi-tenancy: caller must belong to organization.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const ALLOWED_EVENT_TYPES = new Set([
  'app_start',
  'app_foreground',
  'app_background',
  'workday_timer_started',
  'workday_timer_stopped',
  'location_permission_denied',
  'location_permission_restored',
  'battery_snapshot',
]);

interface Body {
  organizationId?: string;
  staffId?: string;
  eventType?: string;
  occurredAt?: string;
  batteryLevel?: number | null;
  batteryPercent?: number | null;
  isCharging?: boolean | null;
  appState?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  metadata?: Record<string, unknown> | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampPercent(level: number | null | undefined, percent: number | null | undefined): number | null {
  if (typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100) {
    return Math.round(percent);
  }
  if (typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 1) {
    return Math.round(level * 100);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const {
      organizationId,
      staffId,
      eventType,
      occurredAt,
      batteryLevel = null,
      batteryPercent = null,
      isCharging = null,
      appState = null,
      platform = null,
      appVersion = null,
      metadata = {},
    } = body;

    if (!organizationId || !staffId || !eventType) {
      return json({ error: 'missing_required_fields' }, 400);
    }
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return json({ error: 'invalid_event_type', eventType }, 400);
    }

    const occurredIso = (() => {
      const t = occurredAt ? new Date(occurredAt) : new Date();
      return Number.isFinite(t.getTime()) ? t.toISOString() : new Date().toISOString();
    })();

    // Auth: accept Supabase JWT for admin/debug calls. For mobile staff calls
    // we accept either the user JWT (logged-in staff) or the same auth header.
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return json({ error: 'unauthorized' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Confirm caller belongs to organization.
    const { data: membership } = await admin
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', userRes.user.id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return json({ error: 'forbidden_for_organization' }, 403);
    }

    const pct = clampPercent(batteryLevel, batteryPercent);
    const lvl =
      typeof batteryLevel === 'number' && Number.isFinite(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 1
        ? batteryLevel
        : pct != null
        ? pct / 100
        : null;

    const { error } = await admin.from('staff_app_health_events').insert({
      organization_id: organizationId,
      staff_id: staffId,
      event_type: eventType,
      occurred_at: occurredIso,
      battery_level: lvl,
      battery_percent: pct,
      is_charging: typeof isCharging === 'boolean' ? isCharging : null,
      app_state: appState ?? null,
      platform: platform ?? null,
      app_version: appVersion ?? null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });

    if (error) {
      // Soft-fail: log + return ok so the app never crashes on health-event errors.
      console.warn('[record-staff-app-health-event] insert failed:', error.message);
      return json({ ok: false, soft_error: error.message }, 200);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.warn('[record-staff-app-health-event] error:', (e as Error).message);
    // Soft-fail to caller to avoid crashing mobile app on diagnostics.
    return json({ ok: false, soft_error: (e as Error).message }, 200);
  }
});
