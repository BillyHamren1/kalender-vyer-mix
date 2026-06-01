import { FileText, ClipboardCheck, CalendarRange } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StaffListTab from '@/components/staff-time-reports/StaffListTab';
import PendingApprovalsTab from '@/components/staff-time-reports/PendingApprovalsTab';

/**
 * Innehållet i tidrapport-/lönevyn — utan egen PageContainer/PageHeader så
 * komponenten kan återanvändas både i `/staff-management/time-reports` och
 * i Lön-tabben på `/staff-management/time`.
 */
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

export default function StaffTimeReportsContent() {
  return (
    <div className="px-4 pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} className="group">
            <Card className="p-3 h-full hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors flex items-start gap-3">
              <q.icon className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium group-hover:text-purple-700">{q.title}</div>
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
    </div>
  );
}
