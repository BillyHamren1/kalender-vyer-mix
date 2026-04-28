/**
 * timeReviewQueries — fetch + assemble person×day rows for AdminTimeReview.
 *
 * One round of parallel queries against time_reports, travel_time_logs,
 * workdays and staff. Output is a flat array of `DayReviewRow` items —
 * one per (staff, date) — already shaped to feed
 * `evaluateAdminTimeReview()`.
 *
 * No React, no UI. Tested via the manifest in src/test.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  AdminTimeReviewInput,
  AdminTimeReviewResult,
  ReviewWorkEntry,
  ReviewTravelSegment,
  evaluateAdminTimeReview,
} from './adminTimeReviewEngine';

export interface DayReviewRow {
  staffId: string;
  staffName: string;
  staffColor: string | null;
  date: string; // YYYY-MM-DD
  workdayId: string | null;
  workdayStart: string | null;
  workdayEnd: string | null;
  workEntries: ReviewWorkEntry[];
  travelSegments: ReviewTravelSegment[];
  result: AdminTimeReviewResult;
  reviewStatus: 'open' | 'needs_review' | 'approved';
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface FetchDayReviewArgs {
  fromDate: string; // YYYY-MM-DD inclusive
  toDate: string;   // YYYY-MM-DD inclusive
}

const ymd = (iso: string): string => iso.slice(0, 10);

export async function fetchDayReviewRows(
  args: FetchDayReviewArgs,
): Promise<DayReviewRow[]> {
  const fromIso = `${args.fromDate}T00:00:00.000Z`;
  // Inclusive toDate → fetch up to but not including the next day at 00:00.
  const next = new Date(`${args.toDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const toIso = next.toISOString();

  const [staffRes, reportsRes, travelRes, workdaysRes] = await Promise.all([
    supabase.from('staff_members').select('id, name, color'),
    supabase
      .from('time_reports')
      .select('id, staff_id, report_date, start_time, end_time, hours_worked, is_subdivision, approved, booking_id')
      .gte('report_date', args.fromDate)
      .lte('report_date', args.toDate),
    supabase
      .from('travel_time_logs')
      .select('id, staff_id, report_date, start_time, end_time, hours_worked')
      .gte('report_date', args.fromDate)
      .lte('report_date', args.toDate),
    supabase
      .from('workdays')
      .select('id, staff_id, started_at, ended_at, review_status, approved_at, approved_by')
      .gte('started_at', fromIso)
      .lt('started_at', toIso),
  ]);

  if (staffRes.error) throw staffRes.error;
  if (reportsRes.error) throw reportsRes.error;
  if (travelRes.error) throw travelRes.error;
  if (workdaysRes.error) throw workdaysRes.error;

  const staffById = new Map<string, { name: string; color: string | null }>();
  (staffRes.data ?? []).forEach((s: any) =>
    staffById.set(s.id, { name: s.name, color: s.color ?? null }),
  );

  // Bucket per (staff, date)
  type Bucket = {
    workEntries: ReviewWorkEntry[];
    travelSegments: ReviewTravelSegment[];
    workdayId: string | null;
    workdayStart: string | null;
    workdayEnd: string | null;
    reviewStatus: 'open' | 'needs_review' | 'approved';
    approvedAt: string | null;
    approvedBy: string | null;
  };
  const key = (sid: string, date: string) => `${sid}::${date}`;
  const buckets = new Map<string, Bucket>();
  const ensure = (sid: string, date: string): Bucket => {
    const k = key(sid, date);
    let b = buckets.get(k);
    if (!b) {
      b = {
        workEntries: [],
        travelSegments: [],
        workdayId: null,
        workdayStart: null,
        workdayEnd: null,
        reviewStatus: 'open',
        approvedAt: null,
        approvedBy: null,
      };
      buckets.set(k, b);
    }
    return b;
  };

  for (const r of (reportsRes.data ?? []) as any[]) {
    if (!r.staff_id || !r.report_date) continue;
    const b = ensure(r.staff_id, r.report_date);
    const start = r.start_time
      ? `${r.report_date}T${String(r.start_time).slice(0, 8)}`
      : null;
    const end = r.end_time
      ? `${r.report_date}T${String(r.end_time).slice(0, 8)}`
      : null;
    b.workEntries.push({
      id: r.id,
      start_time: start,
      end_time: end,
      hours_worked: Number(r.hours_worked) || 0,
      is_subdivision: !!r.is_subdivision,
      status: r.status ?? null,
    });
  }

  for (const t of (travelRes.data ?? []) as any[]) {
    if (!t.staff_id || !t.report_date) continue;
    const b = ensure(t.staff_id, t.report_date);
    const start = t.start_time
      ? `${t.report_date}T${String(t.start_time).slice(0, 8)}`
      : null;
    const end = t.end_time
      ? `${t.report_date}T${String(t.end_time).slice(0, 8)}`
      : null;
    b.travelSegments.push({
      id: t.id,
      start_time: start,
      end_time: end,
      hours_worked: Number(t.hours_worked) || 0,
    });
  }

  for (const w of (workdaysRes.data ?? []) as any[]) {
    if (!w.staff_id || !w.started_at) continue;
    const date = ymd(w.started_at);
    const b = ensure(w.staff_id, date);
    b.workdayId = w.id;
    b.workdayStart = w.started_at;
    b.workdayEnd = w.ended_at ?? null;
    b.approvedAt = w.approved_at ?? null;
    b.approvedBy = w.approved_by ?? null;
    b.reviewStatus =
      w.review_status === 'approved'
        ? 'approved'
        : w.review_status === 'needs_review'
          ? 'needs_review'
          : 'open';
  }

  const rows: DayReviewRow[] = [];
  for (const [k, b] of buckets) {
    const [sid, date] = k.split('::');
    const meta = staffById.get(sid) ?? { name: 'Okänd', color: null };
    const input: AdminTimeReviewInput = {
      workday: b.workdayStart
        ? { started_at: b.workdayStart, ended_at: b.workdayEnd }
        : null,
      workEntries: b.workEntries,
      travelSegments: b.travelSegments,
    };
    rows.push({
      staffId: sid,
      staffName: meta.name,
      staffColor: meta.color,
      date,
      workdayId: b.workdayId,
      workdayStart: b.workdayStart,
      workdayEnd: b.workdayEnd,
      workEntries: b.workEntries,
      travelSegments: b.travelSegments,
      result: evaluateAdminTimeReview(input),
      reviewStatus: b.reviewStatus,
      approvedAt: b.approvedAt,
      approvedBy: b.approvedBy,
    });
  }

  rows.sort((a, b) => (a.date === b.date ? a.staffName.localeCompare(b.staffName) : b.date.localeCompare(a.date)));
  return rows;
}
