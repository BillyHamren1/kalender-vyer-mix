import { supabase } from '@/integrations/supabase/client';

export const OFFLINE_THRESHOLD_MIN = 10;

export interface PresenceRow {
  staff_id: string;
  name: string;
  color: string | null;
  role: string | null;
  team_label: string | null;
  booking_label: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  last_address: string | null;
  app_version: string | null;
  app_platform: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
}

export function teamLabel(teamId: string | null): string | null {
  if (!teamId) return null;
  if (teamId.startsWith('team-')) return `Team ${teamId.slice(5)}`;
  return teamId;
}

export function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export function formatAgo(min: number | null): string {
  if (min == null) return 'aldrig';
  if (min < 1) return 'just nu';
  if (min < 60) return `${min} min sedan`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} tim sedan`;
  return `${Math.floor(h / 24)} d sedan`;
}

export function compareVersion(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function fetchTodayPresence(dateStr: string): Promise<PresenceRow[]> {
  const [bsaRes, saRes, staffRes, locRes, bookingsRes] = await Promise.all([
    supabase
      .from('booking_staff_assignments')
      .select('staff_id, booking_id, team_id, assignment_date')
      .eq('assignment_date', dateStr),
    supabase
      .from('staff_assignments')
      .select('staff_id, team_id, assignment_date')
      .eq('assignment_date', dateStr),
    supabase.from('staff_members').select('id, name, color, role'),
    supabase
      .from('staff_locations')
      .select(
        'staff_id, latitude, longitude, updated_at, last_address, app_version, app_platform, battery_percent, is_charging',
      ),
    supabase.from('bookings').select('id, client, booking_number'),
  ]);

  const bsa = (bsaRes.data || []).filter((r: any) => r?.team_id && r.team_id !== 'project');
  const sa = saRes.data || [];
  const staff = staffRes.data || [];
  const locs = locRes.data || [];
  const bookings = bookingsRes.data || [];

  const bookingById = new Map<string, any>(bookings.map((b: any) => [b.id, b]));
  const locByStaff = new Map<string, any>(locs.map((l: any) => [l.staff_id, l]));
  const staffById = new Map<string, any>(staff.map((s: any) => [s.id, s]));

  const out = new Map<string, PresenceRow>();
  const ensure = (sid: string): PresenceRow | null => {
    const s = staffById.get(sid);
    if (!s) return null;
    if (out.has(sid)) return out.get(sid)!;
    const l = locByStaff.get(sid);
    const row: PresenceRow = {
      staff_id: sid,
      name: s.name,
      color: s.color ?? null,
      role: s.role ?? null,
      team_label: null,
      booking_label: null,
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
      updated_at: l?.updated_at ?? null,
      last_address: l?.last_address ?? null,
      app_version: l?.app_version ?? null,
      app_platform: l?.app_platform ?? null,
      battery_percent: l?.battery_percent ?? null,
      is_charging: l?.is_charging ?? null,
    };
    out.set(sid, row);
    return row;
  };

  for (const r of bsa as any[]) {
    const row = ensure(r.staff_id);
    if (!row) continue;
    const b = bookingById.get(r.booking_id);
    if (b && !row.booking_label) {
      row.booking_label = b.client || b.booking_number || null;
    }
    if (!row.team_label) row.team_label = teamLabel(r.team_id);
  }
  for (const r of sa as any[]) {
    const row = ensure(r.staff_id);
    if (!row) continue;
    if (!row.team_label) row.team_label = teamLabel(r.team_id);
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

export async function fetchAllStaffWithPresence(): Promise<PresenceRow[]> {
  const [staffRes, locRes] = await Promise.all([
    supabase.from('staff_members').select('id, name, color, role').order('name'),
    supabase
      .from('staff_locations')
      .select(
        'staff_id, latitude, longitude, updated_at, last_address, app_version, app_platform, battery_percent, is_charging',
      ),
  ]);
  const staff = staffRes.data || [];
  const locs = locRes.data || [];
  const locByStaff = new Map<string, any>(locs.map((l: any) => [l.staff_id, l]));

  return staff.map((s: any): PresenceRow => {
    const l = locByStaff.get(s.id);
    return {
      staff_id: s.id,
      name: s.name,
      color: s.color ?? null,
      role: s.role ?? null,
      team_label: null,
      booking_label: null,
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
      updated_at: l?.updated_at ?? null,
      last_address: l?.last_address ?? null,
      app_version: l?.app_version ?? null,
      app_platform: l?.app_platform ?? null,
      battery_percent: l?.battery_percent ?? null,
      is_charging: l?.is_charging ?? null,
    };
  });
}
