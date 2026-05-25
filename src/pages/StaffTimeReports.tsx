import { Clock, FileText, ClipboardCheck, CalendarRange } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StaffListTab from '@/components/staff-time-reports/StaffListTab';
import PendingApprovalsTab from '@/components/staff-time-reports/PendingApprovalsTab';

// Bryt ut typer (importeras av andra komponenter)
export type {
  SegmentKind,
  DaySegment,
  LatestPing,
  PresenceDebug,
  PlanningStatus,
  ProjectInfo,
  StaffWithDayReport,
} from './StaffTimeReports.types';

const QUICK_LINKS = [
  {
    to: '/staff-management/time-approvals',
    icon: ClipboardCheck,
    title: 'Tidrapport-attest',
    desc: 'Granska och godkänn dagar per person.',
  },
  {
    to: '/staff-management/payroll-month-report',
    icon: FileText,
    title: 'Månadsrapport lön',
    desc: 'Sammanställ godkänd tid per månad för löneunderlag.',
  },
  {
    to: '/staff-management/payroll-periods',
    icon: CalendarRange,
    title: 'Löneperioder',
    desc: 'Lås och godkänn period för utbetalning.',
  },
];

const StaffTimeReports = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader title="Tidrapporter" icon={Clock} variant="purple" />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} className="group">
            <Card className="p-3 h-full hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors flex items-start gap-3">
              <q.icon className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium group-hover:text-purple-700">
                  {q.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{q.desc}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Tabs defaultValue="staff" className="mt-4">
        <TabsList>
          <TabsTrigger value="staff">Personal</TabsTrigger>
          <TabsTrigger value="pending">Att attestera</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <StaffListTab />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingApprovalsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default StaffTimeReports;
