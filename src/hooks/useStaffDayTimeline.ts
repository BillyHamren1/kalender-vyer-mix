/**
 * useStaffDayTimeline
 * ───────────────────
 * Aggregerar allt vi vet om en staff:s dag från strukturerade källor:
 *   - location_time_entries  (geofence-baserade in/ut per location)
 *   - travel_time_logs       (resor mellan platser)
 *   - workday_flags          (prompts/avvikelser/beslut)
 *   - staff_location_history (råa GPS-pings, om backfilled)
 *   - staff_locations        (senast kända position)
 *
 * Används av StaffDayBacktrackDialog för att rendera tidslinje + karta
 * även när historik-tabellen är tom.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TimelineSegmentKind = 'location' | 'travel' | 'flag' | 'last_known';

export interface LocationSegment {
  kind: 'location';
  id: string;
  start: string;
  end: string | null;
  location_id: string | null;
  location_name: string;
  lat: number | null;
  lng: number | null;
  source: string;
}

export interface TravelSegment {
  kind: 'travel';
  id: string;
  start: string;
  end: string;
  from_address: string | null;
  to_address: string | null;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  hours: number;
  classification: string | null;
}

export interface FlagSegment {
  kind: 'flag';
  id: string;
  start: string;
  flag_type: string;
  title: string;
  resolved: boolean;
}

export interface LastKnownSegment {
  kind: 'last_known';
  start: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface GpsPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
}

export interface StaffDayTimeline {
  segments: Array<LocationSegment | TravelSegment | FlagSegment | LastKnownSegment>;
  gps: GpsPoint[];
  hasGpsHistory: boolean;
}

export const useStaffDayTimeline = (staffId: string | null, date: string | null) => {
  return useQuery<StaffDayTimeline>({
    queryKey: ['staff-day-timeline', staffId, date],
    enabled: !!staffId && !!date,
    queryFn: async () => {
      if (!staffId || !date) throw new Error('staffId and date required');

      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      const [lteRes, travelRes, flagsRes, histRes, lastRes, locsRes] = await Promise.all([
        supabase
          .from('location_time_entries')
          .select('id, entered_at, exited_at, location_id, source')
          .eq('staff_id', staffId)
          .eq('entry_date', date)
          .order('entered_at', { ascending: true }),
        supabase
          .from('travel_time_logs')
          .select('id, start_time, end_time, hours_worked, from_address, to_address, from_latitude, from_longitude, to_latitude, to_longitude, classification')
          .eq('staff_id', staffId)
          .eq('report_date', date)
          .order('start_time', { ascending: true }),
        supabase
          .from('workday_flags')
          .select('id, flag_type, title, resolved, created_at')
          .eq('staff_id', staffId)
          .eq('flag_date', date)
          .order('created_at', { ascending: true }),
        supabase
          .from('staff_location_history')
          .select('lat, lng, accuracy, speed, recorded_at')
          .eq('staff_id', staffId)
          .gte('recorded_at', dayStart)
          .lte('recorded_at', dayEnd)
          .order('recorded_at', { ascending: true })
          .limit(2000),
        supabase
          .from('staff_locations')
          .select('latitude, longitude, accuracy, updated_at')
          .eq('staff_id', staffId)
          .maybeSingle(),
        supabase
          .from('organization_locations')
          .select('id, name, latitude, longitude'),
      ]);

      const locMap = new Map<string, { name: string; lat: number; lng: number }>();
      (locsRes.data || []).forEach((l: any) => {
        locMap.set(l.id, { name: l.name, lat: Number(l.latitude), lng: Number(l.longitude) });
      });

      const segments: StaffDayTimeline['segments'] = [];

      (lteRes.data || []).forEach((row: any) => {
        const loc = row.location_id ? locMap.get(row.location_id) : undefined;
        segments.push({
          kind: 'location',
          id: row.id,
          start: row.entered_at,
          end: row.exited_at,
          location_id: row.location_id,
          location_name: loc?.name || 'Okänd plats',
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          source: row.source,
        });
      });

      (travelRes.data || []).forEach((row: any) => {
        segments.push({
          kind: 'travel',
          id: row.id,
          start: row.start_time,
          end: row.end_time,
          from_address: row.from_address,
          to_address: row.to_address,
          from_lat: row.from_latitude,
          from_lng: row.from_longitude,
          to_lat: row.to_latitude,
          to_lng: row.to_longitude,
          hours: Number(row.hours_worked || 0),
          classification: row.classification,
        });
      });

      (flagsRes.data || []).forEach((row: any) => {
        segments.push({
          kind: 'flag',
          id: row.id,
          start: row.created_at,
          flag_type: row.flag_type,
          title: row.title,
          resolved: row.resolved,
        });
      });

      // Last-known marker (only if today and updated_at falls on this date)
      const last = lastRes.data as any;
      if (last?.updated_at) {
        const lastDate = String(last.updated_at).slice(0, 10);
        if (lastDate === date) {
          segments.push({
            kind: 'last_known',
            start: last.updated_at,
            lat: Number(last.latitude),
            lng: Number(last.longitude),
            accuracy: last.accuracy != null ? Number(last.accuracy) : null,
          });
        }
      }

      segments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const gps: GpsPoint[] = (histRes.data || []).map((r: any) => ({
        recorded_at: r.recorded_at,
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        speed: r.speed != null ? Number(r.speed) : null,
      }));

      return {
        segments,
        gps,
        hasGpsHistory: gps.length > 0,
      };
    },
  });
};
