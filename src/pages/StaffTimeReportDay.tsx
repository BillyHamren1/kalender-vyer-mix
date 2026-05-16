import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';
import { useSmartBack } from '@/hooks/useSmartBack';

/**
 * Egen route för en persons tidrapporter (dag/vecka). Helt separerad från
 * översikten /staff-management/time-reports — så att Tillbaka kan gå till
 * den sida man kom ifrån (projekt, ekonomi, översikten m.m.) istället för
 * att alltid kasta tillbaka till Gantt-listan.
 */
const StaffTimeReportDay: React.FC = () => {
  const { staffId, date } = useParams<{ staffId: string; date?: string }>();
  const goBack = useSmartBack('/staff-management/time-reports');

  const [staffName, setStaffName] = useState<string>('');

  const initialDate = useMemo(() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date(`${date}T12:00:00Z`);
    }
    return new Date();
  }, [date]);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', staffId)
        .maybeSingle();
      if (!cancelled && data?.name) setStaffName(data.name);
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  if (!staffId) {
    return (
      <PageContainer theme="purple">
        <PageHeader icon={Clock} title="Tidrapporter" subtitle="Saknar personal-id" variant="purple">
          <Button variant="outline" size="sm" onClick={goBack} className="rounded-lg gap-1.5 h-8 px-3">
            <ArrowLeft className="h-3.5 w-3.5" />
            Tillbaka
          </Button>
        </PageHeader>
      </PageContainer>
    );
  }

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={Clock}
        title={staffName || 'Tidrapporter'}
        subtitle="Tidrapporter per vecka"
        variant="purple"
      >
        <Button variant="outline" size="sm" onClick={goBack} className="rounded-lg gap-1.5 h-8 px-3">
          <ArrowLeft className="h-3.5 w-3.5" />
          Tillbaka
        </Button>
      </PageHeader>
      <StaffTimeReportDetail
        staffId={staffId}
        staffName={staffName}
        initialDate={initialDate}
      />
    </PageContainer>
  );
};

export default StaffTimeReportDay;
