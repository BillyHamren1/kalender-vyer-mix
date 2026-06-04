import React from 'react';
import { CalendarDays } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { MyCalendarShell } from '@/components/my-page/MyCalendarShell';

const MyPageCalendar: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={CalendarDays}
        title="Min kalender"
        variant="purple"
        subtitle="Dina projekt, deadlines och todos"
      />
      <MyCalendarShell />
    </PageContainer>
  );
};

export default MyPageCalendar;
