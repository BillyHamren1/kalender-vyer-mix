import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { StaffTimeReportsList } from '@/components/staff/StaffTimeReportsList';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';
import { startOfMonth, endOfMonth, format } from 'date-fns';

interface StaffWithLatestReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  latest_report_date: string | null;
  latest_hours: number | null;
  total_hours_this_month: number;
  reports_count: number;
  has_open_report: boolean;
}

const StaffTimeReports: React.FC = () => {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-overview', monthStart],
    queryFn: async (): Promise<StaffWithLatestReport[]> => {
      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, role, color')
        .eq('is_active', true)
        .order('name');

      if (staffError) throw staffError;
      if (!staff) return [];

      const [reportsRes, latestRes, travelRes, openRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select('staff_id, report_date, hours_worked, end_time')
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd),
        supabase
          .from('time_reports')
          .select('staff_id, report_date, hours_worked')
          .order('report_date', { ascending: false }),
        supabase
          .from('travel_time_logs')
          .select('staff_id, hours_worked')
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .not('end_time', 'is', null),
        supabase
          .from('time_reports')
          .select('staff_id')
          .is('end_time', null),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (latestRes.error) throw latestRes.error;
      const reports = reportsRes.data;
      const latestReports = latestRes.data;
      const travelReports = travelRes.data || [];
      const openReports = openRes.data || [];

      const openStaffIds = new Set<string>(openReports.map(r => r.staff_id));

      const latestByStaff = new Map<string, { date: string; hours: number }>();
      for (const r of latestReports || []) {
        if (!latestByStaff.has(r.staff_id)) {
          latestByStaff.set(r.staff_id, { date: r.report_date, hours: r.hours_worked });
        }
      }

      const monthlyByStaff = new Map<string, { totalHours: number; count: number }>();
      for (const r of reports || []) {
        const existing = monthlyByStaff.get(r.staff_id) || { totalHours: 0, count: 0 };
        existing.totalHours += r.hours_worked;
        existing.count += 1;
        monthlyByStaff.set(r.staff_id, existing);
      }
      for (const t of travelReports) {
        const existing = monthlyByStaff.get(t.staff_id) || { totalHours: 0, count: 0 };
        existing.totalHours += t.hours_worked;
        monthlyByStaff.set(t.staff_id, existing);
      }

      return staff
        .map(s => {
          const latest = latestByStaff.get(s.id);
          const monthly = monthlyByStaff.get(s.id) || { totalHours: 0, count: 0 };
          return {
            id: s.id,
            name: s.name,
            role: s.role,
            color: s.color,
            latest_report_date: latest?.date || null,
            latest_hours: latest?.hours || null,
            total_hours_this_month: monthly.totalHours,
            reports_count: monthly.count,
            has_open_report: openStaffIds.has(s.id),
          };
        })
        // Show only staff who reported time this month (or have an active open report)
        .filter(s => s.reports_count > 0 || s.has_open_report);
    },
  });

  if (selectedStaffId) {
    return (
      <PageContainer theme="purple">
        <PageHeader
          icon={Clock}
          title={selectedStaffName}
          subtitle="Tidrapporter per månad"
          variant="purple"
        >
          <Button variant="outline" size="sm" onClick={() => setSelectedStaffId(null)} className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
        </PageHeader>
        <StaffTimeReportDetail staffId={selectedStaffId} staffName={selectedStaffName} />
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
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />
    </PageContainer>
  );
};

export default StaffTimeReports;
