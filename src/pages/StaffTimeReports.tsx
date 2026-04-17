import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { StaffTimeReportsList } from '@/components/staff/StaffTimeReportsList';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';
import { format } from 'date-fns';

interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

interface StaffWithDayReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  total_hours: number;
  reports_count: number;
  has_open_report: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  projects: ProjectInfo[];
}

const StaffTimeReports: React.FC = () => {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-day', dateStr],
    queryFn: async (): Promise<StaffWithDayReport[]> => {
      // Fetch all reports + travel for the day in parallel
      const [reportsRes, travelRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select('staff_id, booking_id, hours_worked, start_time, end_time')
          .eq('report_date', dateStr),
        supabase
          .from('travel_time_logs')
          .select('staff_id, hours_worked')
          .eq('report_date', dateStr)
          .not('end_time', 'is', null),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (travelRes.error) throw travelRes.error;

      const reports = reportsRes.data || [];
      const travel = travelRes.data || [];

      // Fetch booking labels
      const bookingIds = [...new Set(reports.map(r => r.booking_id).filter(Boolean))];
      const bookingMap = new Map<string, string>();
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, is_internal, internal_type')
          .in('id', bookingIds);
        (bookings || []).forEach(b => {
          let label: string;
          if (b.is_internal) {
            // Internt projekt (t.ex. Lager) – visa bara klientnamnet
            label = b.client || 'Internt';
          } else if (b.booking_number) {
            label = `${b.booking_number} · ${b.client}`;
          } else {
            label = b.client;
          }
          bookingMap.set(b.id, label);
        });
      }

      // Build per-staff aggregate
      type Agg = {
        total_hours: number;
        reports_count: number;
        has_open_report: boolean;
        earliest_start: string | null;
        latest_end: string | null;
        projects: Map<string, { label: string; is_open: boolean }>;
      };
      const byStaff = new Map<string, Agg>();

      for (const r of reports) {
        const a = byStaff.get(r.staff_id) || {
          total_hours: 0,
          reports_count: 0,
          has_open_report: false,
          earliest_start: null,
          latest_end: null,
          projects: new Map(),
        };
        a.total_hours += r.hours_worked || 0;
        a.reports_count += 1;
        if (!r.end_time) a.has_open_report = true;
        if (r.start_time && (!a.earliest_start || r.start_time < a.earliest_start)) {
          a.earliest_start = r.start_time;
        }
        if (r.end_time && (!a.latest_end || r.end_time > a.latest_end)) {
          a.latest_end = r.end_time;
        }
        if (r.booking_id) {
          const label = bookingMap.get(r.booking_id) || 'Okänt projekt';
          const existing = a.projects.get(r.booking_id);
          a.projects.set(r.booking_id, {
            label,
            is_open: (existing?.is_open || false) || !r.end_time,
          });
        }
        byStaff.set(r.staff_id, a);
      }
      for (const t of travel) {
        const a = byStaff.get(t.staff_id) || {
          total_hours: 0,
          reports_count: 0,
          has_open_report: false,
          earliest_start: null,
          latest_end: null,
          projects: new Map(),
        };
        a.total_hours += t.hours_worked || 0;
        byStaff.set(t.staff_id, a);
      }

      const staffIds = [...byStaff.keys()];
      if (staffIds.length === 0) return [];

      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, role, color')
        .in('id', staffIds);

      if (staffError) throw staffError;

      return (staff || [])
        .map(s => {
          const a = byStaff.get(s.id)!;
          return {
            id: s.id,
            name: s.name,
            role: s.role,
            color: s.color,
            total_hours: a.total_hours,
            reports_count: a.reports_count,
            has_open_report: a.has_open_report,
            earliest_start: a.earliest_start,
            latest_end: a.latest_end,
            projects: [...a.projects.entries()].map(([booking_id, v]) => ({
              booking_id,
              label: v.label,
              is_open: v.is_open,
            })),
          };
        })
        .sort((a, b) => {
          if (a.has_open_report !== b.has_open_report) return a.has_open_report ? -1 : 1;
          return a.name.localeCompare(b.name, 'sv');
        });
    },
  });

  if (selectedStaffId) {
    return (
      <PageContainer theme="purple">
        <PageHeader
          icon={Clock}
          title={selectedStaffName}
          subtitle="Tidrapporter per vecka"
          variant="purple"
        >
          <Button variant="outline" size="sm" onClick={() => setSelectedStaffId(null)} className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
        </PageHeader>
        <StaffTimeReportDetail
          staffId={selectedStaffId}
          staffName={selectedStaffName}
          initialDate={selectedDate}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={Clock}
        title="Tidrapporter"
        subtitle="Översikt av rapporterad tid per personal"
        variant="purple"
      />
      <StaffTimeReportsList
        staffList={staffList}
        isLoading={isLoading}
        onSelectStaff={(id, name) => {
          setSelectedStaffId(id);
          setSelectedStaffName(name);
        }}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />
    </PageContainer>
  );
};

export default StaffTimeReports;
