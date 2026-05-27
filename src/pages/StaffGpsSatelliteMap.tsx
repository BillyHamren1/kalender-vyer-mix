import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Satellite, Radio } from 'lucide-react';
import StaffGpsSatelliteMap from '@/components/staff/StaffGpsSatelliteMap';
import LiveStaffPositionsMap from '@/components/staff/LiveStaffPositionsMap';

type Tab = 'history' | 'live';

export default function StaffGpsSatelliteMapPage() {
  const [params] = useSearchParams();
  const staffId = params.get('staffId');
  const date = params.get('date');
  const initialTab: Tab = params.get('tab') === 'live' ? 'live' : 'history';
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <PageContainer theme="purple">
      <PageHeader
        title="GPS-karta"
        subtitle="Personalens rörelser, platser och geofence-besök."
        icon={Satellite}
        variant="purple"
      />

      <div className="mb-4 inline-flex rounded-lg border border-[hsl(270_20%_88%)] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === 'history'
              ? 'bg-[hsl(270_50%_96%)] text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Satellite className="h-4 w-4" /> Dagsrutt
        </button>
        <button
          type="button"
          onClick={() => setTab('live')}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === 'live'
              ? 'bg-[hsl(270_50%_96%)] text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Radio className="h-4 w-4" /> Livepositioner
          <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </button>
      </div>

      {tab === 'history' ? (
        <StaffGpsSatelliteMap initialStaffId={staffId} initialDate={date} />
      ) : (
        <LiveStaffPositionsMap />
      )}
    </PageContainer>
  );
}
