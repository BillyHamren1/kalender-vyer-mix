import React from 'react';
import { CalendarDays } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

const MyPageCalendar: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={CalendarDays}
        title="Min kalender"
        variant="purple"
        subtitle="Dina pass, rig- och eventdagar"
      />
      <Card>
        <CardContent className="py-12 text-center">
          <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Din personliga kalendervy kommer snart.</p>
          <p className="text-xs text-muted-foreground mt-1">Tills vidare, använd Personalplanering.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default MyPageCalendar;
