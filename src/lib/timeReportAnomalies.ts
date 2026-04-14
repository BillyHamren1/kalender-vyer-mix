/**
 * Anomaly detection for time reports.
 * Pure logic – no Supabase calls, no React.
 */

export type AnomalyType =
  | 'team_time_deviation'
  | 'unreasonable_travel'
  | 'time_gap'
  | 'missing_report'
  | 'long_day'
  | 'overlapping_times';

export type AnomalySeverity = 'warning' | 'error';

export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  date: string; // yyyy-MM-dd
  title: string;
  description: string;
  relatedReportId?: string;
}

export interface TimeEntry {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  type: 'work' | 'travel';
}

export interface TravelEntry {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
  from_address: string | null;
  to_address: string | null;
}

export interface TeamMemberReport {
  staff_name: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  booking_id: string;
}

export interface AssignmentDate {
  date: string;
  booking_id: string;
}

// ── Helpers ──

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const s = t.slice(0, 5);
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHM(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${h}:${String(min).padStart(2, '0')}`;
}

/** Haversine distance in km */
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Detection functions ──

function groupByDate<T extends { report_date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const arr = map.get(item.report_date) || [];
    arr.push(item);
    map.set(item.report_date, arr);
  }
  return map;
}

export function detectAnomalies(
  entries: TimeEntry[],
  travelEntries: TravelEntry[],
  teamReports: TeamMemberReport[],
  assignments: AssignmentDate[],
  staffName: string,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const entriesByDate = groupByDate(entries);
  const travelByDate = groupByDate(travelEntries);

  // 1. Team time deviation
  const teamByDateBooking = new Map<string, TeamMemberReport[]>();
  for (const tr of teamReports) {
    const key = `${tr.report_date}|${tr.booking_id}`;
    const arr = teamByDateBooking.get(key) || [];
    arr.push(tr);
    teamByDateBooking.set(key, arr);
  }
  for (const [key, members] of teamByDateBooking) {
    const [date] = key.split('|');
    const starts = members.map(m => timeToMinutes(m.start_time)).filter((v): v is number => v !== null);
    const ends = members.map(m => timeToMinutes(m.end_time)).filter((v): v is number => v !== null);

    if (starts.length >= 2) {
      const diff = Math.max(...starts) - Math.min(...starts);
      if (diff > 60) {
        const others = members.filter(m => m.staff_name !== staffName);
        const otherNames = others.map(m => `${m.staff_name} (${m.start_time?.slice(0, 5)})`).join(', ');
        anomalies.push({
          type: 'team_time_deviation',
          severity: 'warning',
          date,
          title: 'Teamtidavvikelse – start',
          description: `Starttiderna skiljer sig >1h inom teamet. Övriga: ${otherNames}`,
        });
      }
    }
    if (ends.length >= 2) {
      const diff = Math.max(...ends) - Math.min(...ends);
      if (diff > 60) {
        const others = members.filter(m => m.staff_name !== staffName);
        const otherNames = others.map(m => `${m.staff_name} (${m.end_time?.slice(0, 5)})`).join(', ');
        anomalies.push({
          type: 'team_time_deviation',
          severity: 'warning',
          date,
          title: 'Teamtidavvikelse – slut',
          description: `Sluttiderna skiljer sig >1h inom teamet. Övriga: ${otherNames}`,
        });
      }
    }
  }

  // 2. Unreasonable travel time
  for (const travel of travelEntries) {
    if (
      travel.from_latitude != null &&
      travel.from_longitude != null &&
      travel.to_latitude != null &&
      travel.to_longitude != null
    ) {
      const distKm = haversineKm(
        travel.from_latitude, travel.from_longitude,
        travel.to_latitude, travel.to_longitude,
      );
      const expectedMinutes = distKm * 1.5; // ~1.5 min/km
      const actualMinutes = travel.hours_worked * 60;
      if (actualMinutes > expectedMinutes * 2 && actualMinutes > 30) {
        anomalies.push({
          type: 'unreasonable_travel',
          severity: 'warning',
          date: travel.report_date,
          title: 'Orimlig restid',
          description: `Resa ${travel.from_address || '?'} → ${travel.to_address || '?'} tog ${minutesToHM(actualMinutes)}. Förväntat: ~${minutesToHM(expectedMinutes)} (${Math.round(distKm)} km)`,
          relatedReportId: travel.id,
        });
      }
    }
    // General cap
    if (travel.hours_worked > 1.5) {
      const already = anomalies.find(
        a => a.type === 'unreasonable_travel' && a.relatedReportId === travel.id,
      );
      if (!already) {
        anomalies.push({
          type: 'unreasonable_travel',
          severity: 'warning',
          date: travel.report_date,
          title: 'Lång restid',
          description: `Resa tog ${minutesToHM(travel.hours_worked * 60)} (>1.5h)`,
          relatedReportId: travel.id,
        });
      }
    }
  }

  // Per-day checks
  for (const [date, dayEntries] of entriesByDate) {
    const sorted = [...dayEntries]
      .filter(e => e.start_time && e.end_time)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

    // 3. Time gaps (work entries only)
    const workSorted = sorted.filter(e => e.type === 'work');
    for (let i = 1; i < workSorted.length; i++) {
      const prevEnd = timeToMinutes(workSorted[i - 1].end_time);
      const currStart = timeToMinutes(workSorted[i].start_time);
      if (prevEnd !== null && currStart !== null) {
        const gap = currStart - prevEnd;
        // Check if a travel entry covers the gap
        const dayTravel = travelByDate.get(date) || [];
        const travelCoversGap = dayTravel.some(t => {
          const ts = timeToMinutes(t.start_time);
          const te = timeToMinutes(t.end_time);
          return ts !== null && te !== null && ts >= prevEnd - 5 && te <= currStart + 5;
        });
        if (gap > 60 && !travelCoversGap) {
          anomalies.push({
            type: 'time_gap',
            severity: 'warning',
            date,
            title: 'Tidslucka',
            description: `${minutesToHM(gap)} lucka mellan ${workSorted[i - 1].end_time?.slice(0, 5)} och ${workSorted[i].start_time?.slice(0, 5)} utan registrerad resa`,
          });
        }
      }
    }

    // 5. Long day
    const totalDay = dayEntries.reduce((s, e) => s + e.hours_worked, 0);
    if (totalDay > 12) {
      anomalies.push({
        type: 'long_day',
        severity: 'error',
        date,
        title: 'Extremt lång arbetsdag',
        description: `Total arbetstid ${minutesToHM(totalDay * 60)} (>12h)`,
      });
    }

    // 6. Overlapping times
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = timeToMinutes(sorted[i - 1].end_time);
      const currStart = timeToMinutes(sorted[i].start_time);
      if (prevEnd !== null && currStart !== null && currStart < prevEnd) {
        anomalies.push({
          type: 'overlapping_times',
          severity: 'error',
          date,
          title: 'Överlappande tider',
          description: `${sorted[i - 1].end_time?.slice(0, 5)} överlappar med start ${sorted[i].start_time?.slice(0, 5)}`,
          relatedReportId: sorted[i].id,
        });
      }
    }
  }

  // 4. Missing reports
  const reportedDates = new Set(entries.filter(e => e.type === 'work').map(e => e.report_date));
  for (const a of assignments) {
    if (!reportedDates.has(a.date)) {
      anomalies.push({
        type: 'missing_report',
        severity: 'warning',
        date: a.date,
        title: 'Saknad tidrapport',
        description: `Tilldelad ett uppdrag denna dag men ingen tidrapport registrerad`,
      });
    }
  }

  return anomalies;
}

export function getAnomaliesForDate(anomalies: Anomaly[], date: string): Anomaly[] {
  return anomalies.filter(a => a.date === date);
}

export function getAnomalyCountByDate(anomalies: Anomaly[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of anomalies) {
    map.set(a.date, (map.get(a.date) || 0) + 1);
  }
  return map;
}
